# Security

This document describes MUID's security model, the secret-rotation runbook, and the
run order for the one-time data migrations.

> **Note:** Hashed client secrets, encrypted social-login tokens, PKCE enforcement,
> signed OIDC cookies, and rate limiting are introduced by the **security-hardening PR
> series**. Sections referencing them describe the target state once those PRs are
> deployed.

## Security Model

### What is hashed, encrypted, or signed — and where the keys live

| Asset | Protection | Key / location |
| --- | --- | --- |
| OAuth client secrets (`OauthApplication.clientSecret`) | Hashed with **scrypt** (never stored or retrievable in plaintext) — *hardening series* | No key; one-way hash in the database |
| Social-login tokens (`account.accessToken` / `refreshToken` / `idToken`) | Encrypted at rest — *hardening series* | `TOKEN_ENC_KEY` (env) |
| OIDC signing keys (`Jwks.privateKey`) | AES-256-GCM encrypted at rest; generated on first boot | `JWKS_ENC_KEY` (env) |
| oidc-provider cookies (interaction/session state) | Signed (keygrip-style; first key signs, older keys still verify) — *hardening series* | `OIDC_COOKIE_KEYS` (env, comma-separated) |
| React Router cookie session (CSRF token) | Signed | `SESSION_SECRET` (env) |
| better-auth sessions/tokens | Signed/encrypted by better-auth | `BETTER_AUTH_SECRET` (env) |
| Webhook payloads to relying parties | RS512-signed with the current JWKS private key | Encrypted `Jwks` row (see above) |

### Transport & abuse protections

- **PKCE is required for all OAuth clients** (public and confidential) — *hardening series*.
- **Rate limiting**: better-auth endpoints are limited via Redis-backed counters, and an
  Express limiter covers the OIDC `/oauth2/token` and `/oauth2/authorize` endpoints —
  *hardening series*. Set `TRUST_PROXY` correctly so limits key on real client IPs.
- **Cloudflare Turnstile** protects the email-OTP send endpoint.
- **Startup env validation** rejects boot with missing required secrets — *hardening series*.
- Corporate clients (`CORP_CLIENT_SUFFIX`) only accept users whose email domain is in
  `CORP_ALLOWED_EMAIL_DOMAINS`; only service clients (`SERVICE_CLIENT_SUFFIX`) may
  introspect tokens issued to other clients.

## Generating Strong Secrets

Generate every secret/key below with a CSPRNG, e.g.:

```bash
openssl rand -hex 32
```

## Secret-Rotation Runbook

General pattern: provision the new credential, deploy it, verify, then revoke the old
one. Specifics per secret:

### Google OAuth client secret (`AUTH_GOOGLE_CLIENT_SECRET`)

1. In Google Cloud Console → APIs & Services → Credentials, add a **new** client secret
   on the existing OAuth client (Google supports two concurrent secrets).
2. Update `AUTH_GOOGLE_CLIENT_SECRET` in the deployment environment and restart.
3. Verify Google sign-in works, then delete the old secret in Google Cloud Console.

No user impact: existing sessions and linked accounts are unaffected.

### SMTP password (`SMTP_PASS`)

1. Rotate the credential at the mail provider (create the new password first if the
   provider supports overlapping credentials).
2. Update `SMTP_PASS` (and `SMTP_USER` if it changed) and restart.
3. Send a test email (e.g. trigger an OTP). Failed sends sit in the BullMQ queue and
   will retry, so a short overlap window is tolerable.

### Database password (`DATABASE_URL`)

1. Create a second DB user (or set a new password with the old one still valid, if your
   MariaDB setup allows dual credentials).
2. Update the credentials inside `DATABASE_URL` and restart.
3. Verify connectivity, then drop/disable the old user or password.

### `SESSION_SECRET`

Used to sign the React Router cookie session that stores the CSRF token. Rotating it
invalidates in-flight CSRF sessions only — users may need to refresh an open consent
page.

1. Replace `SESSION_SECRET` with a new value and restart.

### `BETTER_AUTH_SECRET`

Rotating this invalidates better-auth sessions and any tokens derived from it: **all
users are signed out** and must sign in again.

1. Replace `BETTER_AUTH_SECRET` and restart.
2. Announce the forced re-login if rotating proactively rather than in response to a
   compromise.

### `OIDC_COOKIE_KEYS` (zero-downtime rotation)

`OIDC_COOKIE_KEYS` is a comma-separated list. The **first** key signs new cookies; all
keys verify existing ones.

1. **Prepend** a new key: `OIDC_COOKIE_KEYS=<new>,<old>` and restart. New cookies are
   signed with `<new>`, cookies signed with `<old>` still validate.
2. After the OIDC interaction/session TTLs have elapsed (a day is plenty), **drop the
   old key**: `OIDC_COOKIE_KEYS=<new>` and restart.

If the key was compromised, skip step 2's waiting period and drop the old key
immediately (in-flight authorization flows will restart).

### `TOKEN_ENC_KEY`

Encrypts stored social-login tokens. Rotating requires re-encrypting existing rows;
follow the procedure shipped with the hardening PR (re-run
`scripts/migrate-encrypt-account-tokens.mjs` in its re-key mode if provided, or have
users re-link Google). Do not simply swap the key, or existing tokens become
undecryptable.

### `JWKS_ENC_KEY` — **read before rotating**

> **IMPORTANT CAVEAT:** `JWKS_ENC_KEY` encrypts the rows in the `Jwks` table. Rotating
> it makes every existing encrypted row **undecryptable** — the server cannot recover
> the old signing keys with the new env value.

Rotation procedure:

1. Schedule a maintenance window — this step invalidates the signature keys of all
   previously issued tokens.
2. Set the new `JWKS_ENC_KEY`.
3. **Clear the `Jwks` table** (e.g. `DELETE FROM Jwks;`). On the next signing/JWKS
   request the server generates a fresh RSA key pair, encrypts it with the new key, and
   stores it.
4. Restart the application.

Consequences to plan for:

- ID tokens / JWTs signed with the old keys can no longer be verified against the new
  JWKS. Relying parties that cache JWKS will refetch the discovery document and pick up
  the new keys; tokens signed with the dropped keys fail verification and clients must
  re-authenticate or refresh.
- Webhook signatures produced with the old key can no longer be verified after the old
  public key disappears from the JWKS endpoint.

For routine *signing-key* rotation (not the encryption key), use the built-in
`rotateJwks()` / `cleanupOldJwks()` helpers in `app/.server/jwks.ts` instead — they
keep old keys available for verification and do not require touching `JWKS_ENC_KEY`.

## Migration Run Order (security-hardening PR series)

Run these once, in this order, **after** deploying the corresponding PRs:

1. Deploy the PR that introduces hashed client secrets, then run:

   ```bash
   node scripts/migrate-hash-client-secrets.mjs
   ```

   Existing plaintext `clientSecret` values are replaced with scrypt hashes. Record any
   secrets you still need to hand to client owners **before** running this — they are
   not recoverable afterwards.

2. Deploy the PR that introduces token encryption, set `TOKEN_ENC_KEY`, then run:

   ```bash
   node scripts/migrate-encrypt-account-tokens.mjs
   ```

   Existing plaintext social-login tokens in the `account` table are encrypted in place.

Verify each script against a staging environment first, and take a database backup
before running it in production.

## Operational Hygiene

- `.env` and `google-service-account.json` are listed in `.gitignore` and are
  **untracked — never commit them**. Use your platform's secret manager in production.
- Never log secrets; the JSON logger (`app/.server/logger.ts`) does **not** redact
  fields, so anything passed as log metadata ends up in the output verbatim.
- Keep `TRUST_PROXY` accurate for your topology; an incorrect value lets clients spoof
  IPs (breaking rate limits) or breaks secure-cookie detection.
- Run `npm audit` / dependency updates regularly; better-auth, oidc-provider, and
  Prisma publish security advisories through GitHub.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately to **[security contact — TBD]**
(placeholder: open a private security advisory on the repository or email the
maintainer). Do not open public issues for security reports. We aim to acknowledge
reports within 72 hours.
