import Provider, {
    Configuration,
    errors,
    KoaContextWithOIDC,
} from "oidc-provider";
import RedisAdapter from "./adapters/RedisAdaper";
import DatabaseAdapter from "./adapters/DatabaseAdapter";
import ClientAdapter from "./adapters/ClientAdapter";
import GrantAdapter from "./adapters/GrantAdapter";
import { getPrivateJwkForSigning } from "./jwks";
import { logger } from "./logger";
import prisma from "./prisma";
import { OAuthInteractionInvalidError } from "@/errors/common";
import { auth } from "./auth";
import { getEpochTime } from "@/lib/utils";
import { validateScope } from "./cache/scopes";
import { verifySecretHash } from "./utils/secretHash";

export const runtime = "nodejs";
export const OIDC_CLAIMS = {
    openid: ["sub"],
    profile: ["name", "picture", "preferred_username", "username"],
    email: ["email", "email_verified"],
};

const issuer = process.env.OIDC_ISSUER || "http://localhost:3000";

// Models that require long-term persistence in database
const PERSISTENT_MODELS = [
    "Grant",
    "RefreshToken",
    "ClientCredentials",
    "RegistrationAccessToken",
    "BackchannelAuthenticationRequest",
    "PushedAuthorizationRequest",
];

const configuration: Configuration = {
    adapter: (name) => {
        // Use ClientAdapter for Client model
        if (name === "Client") {
            return new ClientAdapter(name);
        }

        if (name === "Grant") {
            return new GrantAdapter(name);
        }

        // Use DatabaseAdapter for long-term storage
        if (PERSISTENT_MODELS.includes(name)) {
            return new DatabaseAdapter(name);
        }

        // Default to DatabaseAdapter for any other models
        return new RedisAdapter(name);
    },

    // Supported claims
    claims: OIDC_CLAIMS,

    // Client secrets are stored as scrypt hashes, so only auth methods that
    // work with hashed secret verification are allowed (client_secret_jwt
    // would require the raw secret for HMAC and must never be offered)
    clientAuthMethods: ["client_secret_basic", "client_secret_post"],

    // Supported features
    features: {
        devInteractions: { enabled: false }, // Disable default dev UI
        registration: { enabled: false },
        introspection: {
            enabled: true,
            allowedPolicy: (ctx, client, token) => {
                if (
                    client.clientId === token.clientId ||
                    client.clientId.endsWith(".service.sanzi.io")
                ) {
                    return true;
                }

                return false;
            },
        },
        jwtUserinfo: { enabled: true },
        resourceIndicators: {
            enabled: true,
            useGrantedResource: () => true,
            defaultResource: () => "https://api.muisnowdevs.one",
            async getResourceServerInfo(ctx, indicator, client) {
                if (!indicator)
                    throw new Error("No resource indicator provided");

                if (!ctx.oidc.requestParamScopes) return { scope: "" };
                const requested = Array.isArray(ctx.oidc.requestParamScopes)
                    ? ctx.oidc.requestParamScopes
                    : ctx.oidc.requestParamScopes instanceof Set
                      ? Array.from(ctx.oidc.requestParamScopes)
                      : String(ctx.oidc.requestParamScopes)
                            .split(/\s+/)
                            .filter(Boolean);

                const vscopes = await validateScope(requested);

                if (vscopes.invalidScopes?.length) {
                    throw new OAuthInteractionInvalidError(
                        `Requested scopes not available: ${vscopes.invalidScopes.join(", ")}`
                    );
                }

                return {
                    scope: vscopes.validScopes.map((s) => s.id).join(" "),
                    accessTokenFormat: "opaque",
                };
            },
        },
    },

    expiresWithSession: () => false,
    renderError: async (ctx, out, error) => {
        if (error instanceof OAuthInteractionInvalidError) {
            logger.warn(
                "OIDC Interaction error: missing scopes (this message might not be necessary)",
                { error: error.message }
            );
        } else {
            logger.error("OIDC Provider error:", error);
        }

        ctx.redirect(
            `/authorize/error?type=${encodeURIComponent(
                error.name
            )}&detail=${encodeURIComponent((error instanceof errors.OIDCProviderError && error.error_description) || error.message)}`
        );
    },

    ttl: {
        Interaction: 10 * 60, // 10 minutes
        AccessToken: 60 * 60, // 1 hour
        AuthorizationCode: 10 * 60, // 10 minutes
        IdToken: 60 * 60, // 1 hour
        RefreshToken: 27 * 24 * 60 * 60, // 27 days
        DeviceCode: 10 * 60, // 10 minutes
        Session: 5 * 60,
    },

    findAccount: async (_, id) => getUserInfoByScopes(id),
    revokeGrantPolicy: () => false,

    loadExistingGrant,
    interactions: {
        async url(ctx, interaction) {
            if (ctx.oidc.requestParamScopes.size === 0) {
                throw new OAuthInteractionInvalidError(
                    "At least one scope must be requested."
                );
            }

            const session = await auth.api
                .getSession({
                    headers: ctx.req.headers as Record<string, string>,
                })
                .then((s) => s?.user.id);

            if (
                session &&
                (!ctx.oidc.session?.accountId ||
                    ctx.oidc.session.accountId !== session)
            ) {
                interaction.result = {
                    login: { accountId: session, remember: false },
                };
                await interaction.save(interaction.exp - getEpochTime());
            }

            return `/authorize/${interaction.uid}`;
        },
    },
    jwks: {
        keys: [await getPrivateJwkForSigning()],
    },
};

async function loadGrantByUserIdClientId(userId?: string, clientId?: string) {
    if (!userId || !clientId) {
        return undefined;
    }

    const grantId = await prisma.oauthConsent
        .findFirst({
            where: { userId, clientId },
            select: { id: true },
        })
        .then((g) => g?.id);

    return grantId;
}

async function loadExistingGrant(ctx: KoaContextWithOIDC) {
    const clientid = ctx.oidc.params?.client_id as string | undefined;
    const accountId = ctx.oidc.session?.accountId;
    const currentSession = await auth.api.getSession({
        headers: ctx.req.headers as Record<string, string>,
    });

    if (currentSession?.user.id !== accountId) {
        return undefined;
    }

    const grantId = await loadGrantByUserIdClientId(accountId, clientid);
    return grantId ? provider.Grant.find(grantId) : undefined;
}

const provider = new Provider(issuer, configuration);

// Stored client secrets are scrypt hashes (see app/.server/utils/secretHash.ts),
// so override oidc-provider's default constant-time plaintext comparison with
// timing-safe hash verification. The call site in lib/shared/client_auth.js
// awaits this, so the async override covers client_secret_basic,
// client_secret_post and introspection endpoint authentication.
(
    provider.Client.prototype as unknown as {
        compareClientSecret(actual: string): Promise<boolean>;
    }
).compareClientSecret = async function (
    this: { clientSecret?: string },
    actual: string
) {
    return verifySecretHash(this.clientSecret, actual);
};

provider.proxy = true;
provider.on("server_error", (error) => {
    logger.error("OIDC Provider server error:", { error: error.message });
});

provider.on("authorization.error", (ctx, error) => {
    logger.error("OIDC Provider authorization error:", {
        error: error.error_detail,
    });
});

provider.on("grant.error", (ctx, error) => {
    logger.error("OIDC Provider grant error:", { error: error.error_detail });
});

async function getUserInfoByScopes(id: string) {
    const user = await prisma.user.findUnique({
        where: { id },
    });

    if (!user) return undefined;

    return {
        accountId: id,
        async claims(use: string, scope: string) {
            const claims: {
                sub: string;
                [key: string]: unknown;
            } = { sub: id };

            if (scope.includes("profile")) {
                claims.preferred_username = user.username;
                claims.username = user.username;
                claims.name = user.name;
                claims.picture = user.image;
            }

            if (scope.includes("email")) {
                claims.email = user.email;
                claims.email_verified = user.emailVerified;
            }

            return claims;
        },
    };
}

export { getUserInfoByScopes, loadGrantByUserIdClientId };
export default provider;
