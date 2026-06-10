import { Adapter, AdapterPayload } from "oidc-provider";
import prisma from "../prisma";
import { findClient, invalidateClientCache } from "../cache/clients";
import { hashSecret } from "../utils/secretHash";
import { ignoreRecordNotFound } from "./shared";

/**
 * Client Adapter for OIDC Provider
 * Handles dynamic client registration and retrieval
 * Uses the existing OauthApplication table for actual clients
 */
class ClientAdapter implements Adapter {
    private name: string;

    constructor(name: string) {
        this.name = name;
    }

    /**
     * Upsert a client (used during dynamic client registration)
     */
    async upsert(
        id: string,
        payload: AdapterPayload,
        _expiresIn: number
    ): Promise<void> {
        // Extract client metadata from payload

        // Never persist the plaintext secret; store an scrypt hash instead
        const hashedSecret = payload.client_secret
            ? await hashSecret(payload.client_secret)
            : "";

        // Strip the plaintext secret from the stored metadata as well, since
        // the metadata column is cached (see app/.server/cache/clients.ts)
        const { client_secret: _clientSecret, ...metadataPayload } = payload;
        const metadata = JSON.stringify(metadataPayload);

        await invalidateClientCache(id);
        await prisma.oauthApplication.upsert({
            where: { clientId: id },
            create: {
                id: crypto.randomUUID(),
                clientId: id,
                clientSecret: hashedSecret,
                name: payload.client_name || "Unnamed Client",
                icon: payload.logo_uri,
                redirectURLs: payload.redirect_uris?.join(",") || "",
                type: payload.application_type || "web",
                metadata,
            },
            update: {
                clientSecret:
                    payload.client_secret === undefined
                        ? undefined
                        : hashedSecret,
                name: payload.client_name || "Unnamed Client",
                icon: payload.logo_uri,
                redirectURLs: payload.redirect_uris?.join(",") || "",
                type: payload.application_type || "web",
                metadata,
            },
        });
    }

    /**
     * Find a client by client_id
     */
    async find(id: string): Promise<AdapterPayload | undefined> {
        const client = await findClient(id);

        if (!client || client.disabled) {
            return undefined;
        }

        const secret = await prisma.oauthApplication.findUnique({
            where: { clientId: id },
            select: { clientSecret: true },
        });
        if (!secret) {
            throw new Error(`Client secret not found for client: ${id}`);
        }

        // Construct AdapterPayload from database fields
        // Note: client_secret holds the stored scrypt hash; verification is
        // handled by the compareClientSecret override in oidc.ts

        return {
            client_id: client.clientId!,
            client_secret: secret.clientSecret,
            client_name: client.name || undefined,
            logo_uri: client.icon || undefined,
            redirect_uris: client.redirectURLs,
            application_type: client.type || "web",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "client_secret_basic",
        } as AdapterPayload;
    }

    /**
     * Not used for Client model
     */
    async findByUserCode(
        _userCode: string
    ): Promise<AdapterPayload | undefined> {
        return undefined;
    }

    /**
     * Not used for Client model
     */
    async findByUid(_uid: string): Promise<AdapterPayload | undefined> {
        return undefined;
    }

    /**
     * Not applicable for Client model
     */
    async consume(_id: string): Promise<void> {
        // Clients are not consumed
    }

    /**
     * Delete a client
     */
    async destroy(id: string): Promise<void> {
        await invalidateClientCache(id);
        await prisma.oauthApplication
            .delete({
                where: { clientId: id },
            })
            .catch(ignoreRecordNotFound("ClientAdapter.destroy"));
    }

    /**
     * Not applicable for Client model
     */
    async revokeByGrantId(_grantId: string): Promise<void> {
        // Not applicable for clients
    }
}

export default ClientAdapter;
