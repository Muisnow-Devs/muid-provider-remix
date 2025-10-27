import Provider, { Configuration, KoaContextWithOIDC } from "oidc-provider";
import RedisAdapter from "./adapters/RedisAdaper";
import DatabaseAdapter from "./adapters/DatabaseAdapter";
import ClientAdapter from "./adapters/ClientAdapter";
import GrantAdapter from "./adapters/GrantAdapter";
import { getJwks } from "./jwks";
import { logger } from "./logger";
import prisma from "./prisma";
import { OAuthInteractionInvalidError } from "@/errors/common";
import { auth } from "./auth";
import { getEpochTime } from "@/lib/utils";

export const runtime = "nodejs";

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

const jwks = await getJwks();
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
    claims: {
        openid: ["sub"],
        profile: ["name", "photo"],
        email: ["email", "email_verified"],
    },

    // Supported features
    features: {
        devInteractions: { enabled: false }, // Disable default dev UI
        registration: { enabled: true }, // Enable dynamic client registration
        revocation: { enabled: true }, // Enable token revocation
        introspection: { enabled: true }, // Enable token introspection
        resourceIndicators: {
            enabled: true,
            useGrantedResource: async (ctx, model) => {
                if (!ctx.oidc.params?.resource) {
                    return false;
                }
                return true;
            },
            defaultResource: () => "https://api.muisnowdevs.one",
            async getResourceServerInfo(ctx, indicator, client) {
                if (!indicator)
                    throw new Error("No resource indicator provided");
                const scopes = await prisma.oidcScope.findMany({
                    select: { id: true },
                });

                if (ctx.oidc.requestParamScopes) {
                    const requested = Array.isArray(ctx.oidc.requestParamScopes)
                        ? ctx.oidc.requestParamScopes
                        : ctx.oidc.requestParamScopes instanceof Set
                          ? Array.from(ctx.oidc.requestParamScopes)
                          : String(ctx.oidc.requestParamScopes)
                                .split(/\s+/)
                                .filter(Boolean);

                    const available = scopes.map((s) => s.id);
                    const missing = requested.filter(
                        (r) => !available.includes(r)
                    );

                    if (missing.length) {
                        throw new OAuthInteractionInvalidError(
                            `Requested scopes not available: ${missing.join(", ")}`
                        );
                    }
                }

                return {
                    audience: "https://api.muisnowdevs.one",
                    scope: scopes.map((s) => s.id).join(" "),
                    accessTokenFormat: "jwt",
                    jwt: {
                        sign: {
                            alg: "RS256",
                        },
                    },
                };
            },
        },
    },

    expiresWithSession: () => false,
    renderError: async (ctx, out, error) => {
        console.error("OIDC Provider error:", error);
        if (error instanceof OAuthInteractionInvalidError) {
            ctx.status = 400;
            ctx.body = {
                error: "invalid_request",
                error_description: error.message,
            };
        }
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

    findAccount: async (ctx, id) => {
        const user = await prisma.user.findUnique({
            where: { id },
        });

        if (!user) return undefined;

        return {
            accountId: id,
            async claims(use, scope) {
                const claims: {
                    sub: string;
                    [key: string]: unknown;
                } = { sub: id };

                if (scope.includes("profile")) {
                    claims.username = user.username;
                    claims.name = user.name;
                    claims.photo = user.image;
                }

                if (scope.includes("email")) {
                    claims.email = user.email;
                    claims.email_verified = user.emailVerified;
                }

                return claims;
            },
        };
    },

    loadExistingGrant,
    interactions: {
        async url(ctx, interaction) {
            const session = await auth.api
                .getSession({
                    headers: ctx.req.headers as Record<string, string>,
                })
                .then((s) => s?.user.id);

            if (session) {
                interaction.result = {
                    login: { accountId: session, remember: false },
                };
                await interaction.save(interaction.exp - getEpochTime());
            }

            return `/authorize/${interaction.uid}`;
        },
    },
    jwks,
};

async function loadExistingGrant(ctx: KoaContextWithOIDC) {
    const clientid = ctx.oidc.params?.client_id as string | undefined;
    const accountId = ctx.oidc.session?.accountId;
    const currentSession = await auth.api.getSession({
        headers: ctx.req.headers as Record<string, string>,
    });

    if (currentSession?.user.id !== accountId) {
        return undefined;
    }

    const grantId = await prisma.oauthConsent
        .findFirst({
            where: {
                userId: accountId,
                clientId: clientid,
            },
            select: { id: true },
        })
        .then((g) => g?.id);

    if (grantId) {
        return ctx.oidc.provider.Grant.find(grantId);
    }

    return undefined;
}

const provider = new Provider(issuer, configuration);
provider.proxy = true;
provider.on("server_error", (error) => {
    logger.error("OIDC Provider server error:", { error });
});

provider.on("authorization.error", (ctx, error) => {
    logger.error("OIDC Provider authorization error:", { error });
});

provider.on("grant.error", (ctx, error) => {
    logger.error("OIDC Provider grant error:", { error });
});

export default provider;
