import Provider, { Configuration } from "oidc-provider";
import RedisAdapter from "./adapters/RedisAdaper";
import DatabaseAdapter from "./adapters/DatabaseAdapter";
import ClientAdapter from "./adapters/ClientAdapter";
import GrantAdapter from "./adapters/GrantAdapter";
import { getJwks } from "./jwks";
import { logger } from "./logger";
import prisma from "./prisma";
import { OAuthInteractionInvalidError } from "@/errors/common";
import { auth } from "./auth";

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
        profile: ["name", "email"],
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
                    scope: scopes.map((s) => s.id).join(" "),
                };
            },
        },
    },

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

    // TTL for various tokens (in seconds)
    ttl: {
        AccessToken: 60 * 60, // 1 hour
        AuthorizationCode: 10 * 60, // 10 minutes
        IdToken: 60 * 60, // 1 hour
        RefreshToken: 14 * 24 * 60 * 60, // 14 days
        Grant: 14 * 24 * 60 * 60, // 14 days
        Session: 14 * 24 * 60 * 60, // 14 days
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
                    claims.name = user.name;
                    claims.email = user.email;
                }

                if (scope.includes("email")) {
                    claims.email = user.email;
                    claims.email_verified = user.emailVerified;
                }

                return claims;
            },
        };
    },

    async loadExistingGrant(ctx) {
        const clientid = ctx.oidc.params?.client_id as string | undefined;
        const accountId =
            ctx.oidc.session?.accountId ||
            (await auth.api
                .getSession({
                    headers: ctx.req.headers as Record<string, string>,
                })
                .then((s) => s?.user.id));
        
        const grantId =
            ctx.oidc.result?.consent?.grantId ||
            ctx.oidc.session?.grantIdFor(clientid || "") ||
            (await prisma.oauthConsent
                .findFirst({
                    where: {
                        userId: accountId,
                        clientId: clientid,
                    },
                    select: { id: true },
                })
                .then((g) => g?.id));

        if (grantId) {
            return ctx.oidc.provider.Grant.find(grantId);
        }

        return undefined;
    },

    interactions: {
        url(ctx, interaction) {
            return `/authorize/${interaction.uid}`;
        },
    },
    jwks,
};

const provider = new Provider(issuer, configuration);
provider.proxy = true;
provider.on("server_error", (error) => {
    logger.error("OIDC Provider server error:", { error });
});

export default provider;
