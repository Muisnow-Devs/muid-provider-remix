# MUID

> This repository is preserved for reference and educational purposes, including for anyone interested in seeing how the site was previously designed and implemented.

This project is the source code of the original MuID system. After being replaced with Logto, it is now useless to me. Therefore, I am leaving this project as a public archive, [as I promised](https://x.com/Hen000000hen/status/2079132927875846364?s=20).

**-- Below is the AI-generated README file --**

MUID is a self-hosted **Identity Provider (IdP)** that combines
[better-auth](https://better-auth.com) (first-party authentication: passkeys, Google
sign-in, email OTP) with [panva oidc-provider](https://github.com/panva/node-oidc-provider)
(standards-compliant OpenID Connect / OAuth 2.x for downstream relying parties).

It is built as a full-stack [React Router 7](https://reactrouter.com/) application served
by a custom Express server, with MariaDB (via Prisma 7) for persistence, Redis (ioredis)
for short-lived OIDC state, and BullMQ for background jobs (email delivery, identity
event fan-out via Google Pub/Sub).

> **Note:** Several features referenced in this document (hashed client secrets,
> encrypted social-login tokens, PKCE enforcement, signed OIDC cookies, rate limiting,
> env-driven deployment config, startup env validation, Vitest, ESLint/Prettier) are
> introduced by the **security-hardening PR series** and describe the target state once
> those PRs land.

## Features

- 🔐 OpenID Connect provider (authorization code + PKCE, refresh tokens, introspection, JWT userinfo, resource indicators)
- 🧑‍💻 First-party auth with better-auth: passkeys, Google OAuth, email OTP, multi-session, admin tooling
- 🤖 Cloudflare Turnstile bot protection on OTP endpoints
- 🗝️ JWKS generated on first boot, stored AES-256-GCM-encrypted in the database, with rotation helpers
- 📬 Background email delivery (Nodemailer over SMTP) and identity events (Google Pub/Sub) via BullMQ workers
- 🚦 Rate limiting on auth and OIDC token/authorize endpoints (better-auth + Redis, Express limiter) — *security-hardening PR series*
- 🚀 Server-side rendering, HMR in development, TypeScript, TailwindCSS

## Architecture

```
server.js                     Express entrypoint (compression, static assets, trust proxy)
└── server/app.ts             App router
    ├── /oauth2/*             panva oidc-provider (+ /oauth2/userinfo override)
    │   └── adapters
    │       ├── ClientAdapter     OAuth clients (DB-backed, cached)
    │       ├── GrantAdapter      Consent/grants (DB-backed)
    │       ├── DatabaseAdapter   Long-lived artifacts (RefreshToken, ClientCredentials, PAR, ...)
    │       └── RedisAdapter      Short-lived artifacts (Session, AuthorizationCode, ...)
    ├── /.well-known/openid-configuration  → rewritten to /oauth2/...
    └── React Router 7 app    UI + better-auth routes (app/)
app/.server/
    ├── auth.ts               better-auth configuration (passkey, Google, email OTP, captcha)
    ├── oidc.ts               oidc-provider configuration (claims, TTLs, interactions)
    ├── jwks.ts               JWKS load/generate/rotate (encrypted at rest in `Jwks` table)
    ├── queue/                BullMQ queue + worker (email, webhooks, Pub/Sub events)
    ├── redis.ts              ioredis client
    └── prisma.ts             Prisma client (@prisma/adapter-mariadb)
```

OIDC interactions render at `/authorize/:uid`; corporate clients (client IDs ending in
the corp suffix) are restricted to allowed email domains.

## Getting Started

### Prerequisites

- Node.js 20+ (the Dockerfile uses `node:20-alpine`)
- MariaDB / MySQL
- Redis
- An SMTP server (for verification/OTP emails)
- A Google Cloud service account with Pub/Sub access
- Google OAuth credentials and Cloudflare Turnstile keys

### Installation

Install the dependencies:

```bash
npm install
```

### Configuration

Copy [`.env.example`](./.env.example) to `.env` and fill in the values — every
variable is documented there and in the [environment variables](#environment-variables)
table below. The server validates the environment at startup (`app/.server/env.ts`)
and refuses to boot if required variables are missing or if secrets are too short
or still set to placeholder values. Generate strong secrets with:

```bash
openssl rand -hex 32
```

`.env` and `google-service-account.json` are gitignored — never commit them.

### Database

Apply migrations (development):

```bash
npm run db:dev:migrate
```

For production deployments use `npm run db:prod:migrate`. Seed initial data with
`npm run db:seed` if needed.

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:3000` (or `PORT`).

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Express + Vite dev server with HMR |
| `npm run build` | Create a production build (`build/client`, `build/server`) |
| `npm start` | Run the production server (note: currently pins `PORT=6638`) |
| `npm run typecheck` | React Router typegen + TypeScript project check |
| `npm test` | Run the Vitest suite — *security-hardening PR series* |
| `npm run lint` / `npm run format` | ESLint / Prettier — *security-hardening PR series* |
| `npm run db:dev` | Start a local Prisma dev database |
| `npm run db:dev:migrate` | Create/apply migrations in development |
| `npm run db:prod:migrate` | Apply migrations in production (`prisma migrate deploy`) |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:seed` | Seed the database |

One-time migration scripts (run **after** deploying the corresponding hardening PRs —
see [SECURITY.md](./SECURITY.md) for the required order):

| Script | Description |
| --- | --- |
| `node scripts/migrate-hash-client-secrets.mjs` | Hash existing plaintext OAuth client secrets (scrypt) |
| `node scripts/migrate-encrypt-account-tokens.mjs` | Encrypt existing social-login tokens at rest (`TOKEN_ENC_KEY`) |

## Environment Variables

Variables marked *(hardening)* are introduced by the security-hardening PR series.

### Core

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | — | MariaDB/MySQL connection string used by Prisma (`@prisma/adapter-mariadb`). Startup fails if unset. |
| `SESSION_SECRET` | Yes | — | Secret for signing the React Router cookie session (CSRF token storage). Startup fails if unset. |
| `BETTER_AUTH_SECRET` | Yes | — | better-auth signing/encryption secret (sessions, tokens). |
| `JWKS_ENC_KEY` | Yes | — | AES-256-GCM key used to encrypt OIDC signing keys at rest in the `Jwks` table. Startup fails if unset. **See SECURITY.md before rotating.** |
| `OIDC_ISSUER` | No | `http://localhost:3000` | Public issuer URL of the OIDC provider. Must be the externally reachable origin in production. |
| `PORT` | No | `3000` | HTTP port for the Express server. |
| `NODE_ENV` | No | — | `development` enables the Vite dev server; anything else serves the production build. |
| `LOG_LEVEL` | No | `info` | Logger verbosity: `debug`, `info`, `warn`, or `error`. |

### Security & hardening *(hardening)*

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `TOKEN_ENC_KEY` | Yes | — | Key for encrypting social-login (Google) access/refresh/ID tokens at rest in the `account` table. |
| `OIDC_COOKIE_KEYS` | Yes | — | Comma-separated list of keys used to sign oidc-provider cookies. First key signs; the rest verify (enables rotation). |
| `TRUST_PROXY` | No | `1` | Express `trust proxy` hops count. Set to the number of reverse proxies in front of the app so rate limiting and secure cookies see real client IPs. |

### Deployment policy *(hardening)*

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `CORP_CLIENT_SUFFIX` | No | `.corp.sanzi.io` | Client-ID suffix identifying corporate clients (restricted to allowed email domains). |
| `CORP_ALLOWED_EMAIL_DOMAINS` | No | `sanzi.io,muisnowdevs.one` | Comma-separated email domains allowed to authorize corporate clients. |
| `SERVICE_CLIENT_SUFFIX` | No | `.service.sanzi.io` | Client-ID suffix identifying trusted service clients (e.g. allowed to introspect tokens of other clients). |
| `OIDC_DEFAULT_RESOURCE` | No | `https://api.muisnowdevs.one` | Default OAuth resource indicator applied when a request specifies none. |

### Google sign-in & captcha

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `AUTH_GOOGLE_CLIENT_ID` | Yes | — | Google OAuth client ID for social sign-in. |
| `AUTH_GOOGLE_CLIENT_SECRET` | Yes | — | Google OAuth client secret. |
| `TURNSTILE_SECRET_KEY` | Yes | — | Cloudflare Turnstile secret key (server-side verification on OTP endpoints). |
| `VITE_TURNSTILE_SITE_KEY` | Yes | — | Cloudflare Turnstile site key. **Build-time** variable embedded in the client bundle. |

### Email (SMTP)

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `SMTP_HOST` | Yes | — | SMTP server hostname. |
| `SMTP_PORT` | No | `587` | SMTP server port. |
| `SMTP_SECURE` | No | `false` | Set to `true` for implicit TLS (port 465 style). |
| `SMTP_USER` | Yes | — | SMTP username. |
| `SMTP_PASS` | Yes | — | SMTP password. |
| `SMTP_FROM` | No | `""` | `From:` address for outgoing mail. |

### Redis & queue

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `REDIS_HOST` | No | `localhost` | Redis host (OIDC short-lived state, BullMQ, rate limiting). |
| `REDIS_PORT` | No | `6379` | Redis port. |
| `REDIS_USER` | No | — | Redis username (if ACLs are enabled). |
| `REDIS_PASS` | No | — | Redis password. |
| `REDIS_DB` | No | `0` | Redis database index. |
| `REDIS_PREFIX` | No | `bull` | Key prefix for BullMQ queues. |
| `QUEUE_CONCURRENCY` | No | `5` | BullMQ worker concurrency. |

### Google Cloud

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Yes | — | Path to the Google service-account JSON used for Pub/Sub identity events (e.g. `./google-service-account.json`). Startup fails if unset. |

The security-hardening PR series also adds **startup env validation**: the server
refuses to boot with missing or obviously weak required secrets instead of failing
later at runtime.

## Building for Production

Create a production build:

```bash
npm run build
```

### Docker Deployment

To build and run using Docker:

```bash
docker build -t muid .

# Run the container
docker run --env-file .env -p 3000:3000 muid
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

Run behind a TLS-terminating reverse proxy and set `TRUST_PROXY` accordingly.

## Security

See [SECURITY.md](./SECURITY.md) for the security model, the secret-rotation runbook
(including the important `JWKS_ENC_KEY` caveat), migration run order, and how to report
vulnerabilities.

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

## Licenses

Even though this is a public archive, this project is still distributed under MIT License. Read more at [LICENSE](LICENSE).

---

Built with ❤️ using React Router.
