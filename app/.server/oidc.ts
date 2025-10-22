import Provider, { Configuration } from "oidc-provider";
import RedisAdapter from "./adapters/RedisAdaper";
import DatabaseAdapter from "./adapters/DatabaseAdapter";
import ClientAdapter from "./adapters/ClientAdapter";
import GrantAdapter from "./adapters/GrantAdapter";
import { getJwks } from "./jwks";
import { logger } from "./logger";
import prisma from "./prisma";

export const runtime = "nodejs";

const issuer = process.env.OIDC_ISSUER || 'http://localhost:3000';

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
                    [key: string]: unknown
                } = { sub: id };

                if (scope.includes('profile')) {
                    claims.name = user.name;
                    claims.email = user.email;
                }

                if (scope.includes('email')) {
                    claims.email = user.email;
                    claims.email_verified = user.emailVerified;
                }

                return claims;
            },
        };
    },

    interactions: {
        url(ctx, interaction) {
            return `/authorize/${interaction.uid}`;
        }
    },
    jwks
}

const provider = new Provider(issuer, configuration);
provider.proxy = true;
provider.on("server_error", (error) => {
    logger.error("OIDC Provider server error:", { error });
});

export default provider;