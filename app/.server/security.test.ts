import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCipheriv, randomBytes } from "node:crypto";

const mocks = vi.hoisted(() => {
    const store = new Map<string, unknown>();
    const session = {
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown) => {
            store.set(key, value);
        },
        unset: (key: string) => {
            store.delete(key);
        },
    };

    return {
        store,
        session,
        getSession: vi.fn(async () => session),
        commitSession: vi.fn(async () => "__session=committed"),
        destroySession: vi.fn(async () => "__session=destroyed"),
        getAuthSession: vi.fn(),
    };
});

vi.mock("./sessions", () => ({
    getSession: mocks.getSession,
    commitSession: mocks.commitSession,
    destroySession: mocks.destroySession,
}));

vi.mock("./auth", () => ({
    auth: { api: { getSession: mocks.getAuthSession } },
}));

vi.mock("./jwks", () => ({
    getPrivateJwkForSigning: vi.fn(),
}));

import {
    encryption,
    decryption,
    generateCSRFToken,
    hashCSRFToken,
    safeCompare,
    commitCSRFToken,
    validateCSRFToken,
} from "./security";

const ENC_KEY = "test-encryption-key";

describe("encryption / decryption", () => {
    it("roundtrips data in the v2 format", () => {
        const plaintext = Buffer.from(
            JSON.stringify({ kty: "RSA", d: "secret" })
        );

        const ciphertext = encryption(plaintext, ENC_KEY);

        expect(ciphertext.startsWith("v2:")).toBe(true);
        expect(decryption(ciphertext, ENC_KEY).equals(plaintext)).toBe(true);
    });

    it("produces a unique ciphertext per call (random salt and iv)", () => {
        const plaintext = Buffer.from("same input");

        const a = encryption(plaintext, ENC_KEY);
        const b = encryption(plaintext, ENC_KEY);

        expect(a).not.toBe(b);
        expect(decryption(a, ENC_KEY).equals(plaintext)).toBe(true);
        expect(decryption(b, ENC_KEY).equals(plaintext)).toBe(true);
    });

    it("decrypts legacy-format ciphertexts (pre-v2 layout)", () => {
        const plaintext = Buffer.from("legacy jwks private key material");

        // Reconstruct the old algorithm: padEnd-derived key,
        // data | iv(16) | authTag(16), unprefixed hex.
        const legacyKey = Buffer.from(ENC_KEY.padEnd(32, "0").slice(0, 32));
        const iv = randomBytes(16);
        const cipher = createCipheriv("aes-256-gcm", legacyKey, iv);
        const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const authTag = cipher.getAuthTag();
        const legacyCiphertext = Buffer.concat([data, iv, authTag]).toString(
            "hex"
        );

        expect(decryption(legacyCiphertext, ENC_KEY).equals(plaintext)).toBe(
            true
        );
    });

    it("rejects tampered v2 ciphertexts (auth tag failure)", () => {
        const ciphertext = encryption(Buffer.from("integrity"), ENC_KEY);

        // Flip the last hex nibble of the encrypted data.
        const lastChar = ciphertext.at(-1);
        const tampered =
            ciphertext.slice(0, -1) + (lastChar === "0" ? "1" : "0");

        expect(() => decryption(tampered, ENC_KEY)).toThrow();
    });

    it("rejects decryption with the wrong key", () => {
        const ciphertext = encryption(Buffer.from("secret"), ENC_KEY);

        expect(() => decryption(ciphertext, "another-key")).toThrow();
    });

    it("rejects v2 ciphertexts that are too short to contain a header", () => {
        expect(() => decryption("v2:" + "ab".repeat(8), ENC_KEY)).toThrow(
            /too short/
        );
    });
});

describe("CSRF token primitives", () => {
    it("generates long, unique tokens", () => {
        const a = generateCSRFToken();
        const b = generateCSRFToken();

        expect(a).toMatch(/^[0-9a-f]{256}$/);
        expect(a).not.toBe(b);
    });

    it("hashes deterministically and binds the user id", () => {
        const token = generateCSRFToken();

        expect(hashCSRFToken(token, "user-1")).toBe(
            hashCSRFToken(token, "user-1")
        );
        expect(hashCSRFToken(token, "user-1")).not.toBe(
            hashCSRFToken(token, "user-2")
        );
    });

    it("safeCompare matches equal strings and rejects others", () => {
        expect(safeCompare("same-value", "same-value")).toBe(true);
        expect(safeCompare("same-value", "other-value")).toBe(false);
        // Different lengths must not throw.
        expect(safeCompare("short", "a-much-longer-value")).toBe(false);
        expect(safeCompare("", "non-empty")).toBe(false);
    });
});

describe("CSRF session flow", () => {
    const userId = "user-123";
    const request = () =>
        new Request("https://idp.example/authorize/abc", {
            method: "POST",
            headers: { Cookie: "__session=existing" },
        });

    beforeEach(() => {
        mocks.store.clear();
        vi.clearAllMocks();
        mocks.getSession.mockResolvedValue(mocks.session);
        mocks.commitSession.mockResolvedValue("__session=committed");
        mocks.getAuthSession.mockResolvedValue({ user: { id: userId } });
    });

    it("commitCSRFToken stores the hashed token and returns Set-Cookie", async () => {
        const result = await commitCSRFToken(request().headers);

        expect(result.csrfToken).toMatch(/^[0-9a-f]{256}$/);
        expect(mocks.store.get("csrfToken")).toBe(
            hashCSRFToken(result.csrfToken, userId)
        );
        expect(result.headers["Set-Cookie"]).toBe("__session=committed");
    });

    it("validateCSRFToken accepts a committed token and rotates it", async () => {
        const { csrfToken } = await commitCSRFToken(request().headers);

        const result = await validateCSRFToken(request(), csrfToken);

        expect(result.headers["Set-Cookie"]).toBe("__session=committed");
        // Token is single-use: cleared from the session...
        expect(mocks.store.has("csrfToken")).toBe(false);
        // ...but the session itself is never destroyed.
        expect(mocks.destroySession).not.toHaveBeenCalled();
    });

    it("validateCSRFToken rejects a wrong token with 403 but keeps the session", async () => {
        await commitCSRFToken(request().headers);

        const thrown = await validateCSRFToken(
            request(),
            generateCSRFToken()
        ).then(
            () => null,
            (error) => error
        );

        expect(thrown).toBeInstanceOf(Response);
        expect((thrown as Response).status).toBe(403);
        expect((thrown as Response).headers.get("Set-Cookie")).toBe(
            "__session=committed"
        );
        expect(mocks.store.has("csrfToken")).toBe(false);
        expect(mocks.destroySession).not.toHaveBeenCalled();
    });

    it("validateCSRFToken rejects a replayed token", async () => {
        const { csrfToken } = await commitCSRFToken(request().headers);

        await validateCSRFToken(request(), csrfToken);
        const thrown = await validateCSRFToken(request(), csrfToken).then(
            () => null,
            (error) => error
        );

        expect(thrown).toBeInstanceOf(Response);
        expect((thrown as Response).status).toBe(403);
    });

    it("validateCSRFToken rejects a missing token with 403", async () => {
        await commitCSRFToken(request().headers);

        const thrown = await validateCSRFToken(request(), undefined).then(
            () => null,
            (error) => error
        );

        expect(thrown).toBeInstanceOf(Response);
        expect((thrown as Response).status).toBe(403);
    });

    it("validateCSRFToken rejects unauthenticated requests with 401", async () => {
        mocks.getAuthSession.mockResolvedValue(null);

        const thrown = await validateCSRFToken(
            request(),
            generateCSRFToken()
        ).then(
            () => null,
            (error) => error
        );

        expect(thrown).toBeInstanceOf(Response);
        expect((thrown as Response).status).toBe(401);
    });
});
