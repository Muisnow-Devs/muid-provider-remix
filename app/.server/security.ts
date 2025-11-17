import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { commitSession, getSession } from "./sessions";
import { getPrivateJwkForSigning } from "./jwks";
import { importJWK } from "jose";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

export function generateCSRFToken() {
    return randomBytes(128).toString("hex");
}

export function encryption(data: Buffer, encryptKey: string) {
    const key = Buffer.from(encryptKey.padEnd(32, "0").slice(0, 32));
    const iv = randomBytes(16);
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    const encryptedData = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([encryptedData, iv, authTag]).toString("hex");
}

export function decryption(encryptedHex: string, encryptKey: string) {
    const encryptedBuffer = Buffer.from(encryptedHex, "hex");
    const key = Buffer.from(encryptKey.padEnd(32, "0").slice(0, 32));

    const authTag = encryptedBuffer.subarray(-16);
    const iv = encryptedBuffer.subarray(-32, -16);
    const data = encryptedBuffer.subarray(0, -32);

    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decryptedData = Buffer.concat([
        decipher.update(data),
        decipher.final(),
    ]);

    return decryptedData;
}

export async function commitCSRFToken(headers: Headers) {
    const session = await getSession(headers.get("Cookie"));
    const csrfToken = generateCSRFToken();
    session.set("csrfToken", csrfToken);
    return {
        csrfToken,
        headers: {
            "Set-Cookie": await commitSession(session),
        },
    };
}

export async function validateCSRFToken(request: Request, csrfToken?: string) {
    const session = await getSession(request.headers.get("Cookie"));
    const storedToken = session.get("csrfToken");
    if (!storedToken || !csrfToken || storedToken !== csrfToken) {
        throw new Response("Invalid CSRF Token", { status: 403 });
    }
}

export async function calculateWebhookSignature(data: string) {
    const privateJwk = await getPrivateJwkForSigning();
    const secret = await importJWK(privateJwk, "RS512");
    if (!(secret instanceof CryptoKey)) {
        throw new Error("Failed to import JWK as CryptoKey");
    }

    const dataBuffer = Buffer.from(data);
    const signatureBuffer = await crypto.subtle.sign(
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-512",
        },
        secret,
        dataBuffer
    );
    return {
        signature: Buffer.from(signatureBuffer).toString("base64url"),
        kid: privateJwk.kid!,
    };
}