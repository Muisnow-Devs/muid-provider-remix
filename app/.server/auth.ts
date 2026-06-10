import { betterAuth, User } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { passkey } from "@better-auth/passkey";
import {
    lastLoginMethod,
    admin,
    username,
    multiSession,
    emailOTP,
    captcha,
} from "better-auth/plugins";
import prisma from "./prisma";
import { enqueue } from "./queue/default";
import emailVerificationTemplate, {
    EmailType,
} from "./templates/emailVerification";
import { SocialProviders } from "better-auth/social-providers";
import { redirectToLogin } from "@/utils";
import { secondaryStorage } from "./storage";
import { rateLimitEnv } from "./rateLimit";

const socialProviders: SocialProviders = {
    google: {
        clientId: process.env.AUTH_GOOGLE_CLIENT_ID!,
        clientSecret: process.env.AUTH_GOOGLE_CLIENT_SECRET!,
        enabled: true,
    },
};

export const auth = betterAuth({
    appName: "MuID",
    database: prismaAdapter(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: false,
    },
    socialProviders,
    plugins: [
        passkey(),
        lastLoginMethod(),
        admin(),
        username({
            displayUsernameValidator: (username) =>
                /^[a-zA-Z0-9_]+$/.test(username),
            maxUsernameLength: 30,
            minUsernameLength: 3,
        }),
        captcha({
            provider: "cloudflare-turnstile",
            secretKey: process.env.TURNSTILE_SECRET_KEY!,
            endpoints: [
                "/email-otp/send-verification-otp",
                // "/sign-in/email-otp",
            ],
        }),
        multiSession(),
        emailOTP({ sendVerificationOTP }),
    ],
    secret: process.env.BETTER_AUTH_SECRET!,
    // Redis-backed storage: used for rate-limit counters (storage defaults to
    // "secondary-storage" when this is set) and session caching.
    secondaryStorage,
    rateLimit: {
        enabled: true,
        window: rateLimitEnv("RATE_LIMIT_AUTH_WINDOW", 60),
        max: rateLimitEnv("RATE_LIMIT_AUTH_MAX", 60),
        // Paths are relative to the auth base path; first matching rule wins,
        // so specific paths must come before wildcards.
        customRules: {
            // Endpoints that send an email (most abusable)
            "/email-otp/send-verification-otp": {
                window: 60,
                max: rateLimitEnv("RATE_LIMIT_OTP_SEND_MAX", 3),
            },
            "/forget-password/email-otp": {
                window: 60,
                max: rateLimitEnv("RATE_LIMIT_OTP_SEND_MAX", 3),
            },
            "/send-verification-email": {
                window: 60,
                max: rateLimitEnv("RATE_LIMIT_OTP_SEND_MAX", 3),
            },
            "/delete-user": {
                window: 60,
                max: rateLimitEnv("RATE_LIMIT_OTP_SEND_MAX", 3),
            },
            // OTP verification (brute-forceable codes)
            "/email-otp/*": {
                window: 60,
                max: rateLimitEnv("RATE_LIMIT_OTP_VERIFY_MAX", 5),
            },
            // Sign-in / sign-up attempts (covers /sign-in/email-otp,
            // /sign-in/social, /sign-in/username, ...)
            "/sign-in/*": {
                window: 60,
                max: rateLimitEnv("RATE_LIMIT_SIGN_IN_MAX", 5),
            },
            "/sign-up/*": {
                window: 60,
                max: rateLimitEnv("RATE_LIMIT_SIGN_IN_MAX", 5),
            },
            // Passkey challenge generation / verification
            "/passkey/generate-authenticate-options": {
                window: 60,
                max: rateLimitEnv("RATE_LIMIT_PASSKEY_MAX", 10),
            },
            "/passkey/generate-register-options": {
                window: 60,
                max: rateLimitEnv("RATE_LIMIT_PASSKEY_MAX", 10),
            },
            "/passkey/verify-authentication": {
                window: 60,
                max: rateLimitEnv("RATE_LIMIT_PASSKEY_MAX", 10),
            },
            "/passkey/verify-registration": {
                window: 60,
                max: rateLimitEnv("RATE_LIMIT_PASSKEY_MAX", 10),
            },
        },
    },
    emailVerification: { sendVerificationEmail },
    user: {
        deleteUser: {
            enabled: true,
            sendDeleteAccountVerification,
            beforeDelete: async (user) => {
                const clients = await prisma.oauthConsent.findMany({
                    where: { userId: user.id },
                    select: { clientId: true },
                });
                await enqueue({
                    type: "user.deleted",
                    payload: {
                        userId: user.id,
                        clients: clients.map((c) => c.clientId),
                    },
                });
            },
        },
    },
    databaseHooks: {
        user: {
            update: {
                after: async (user, changes) => {
                    await enqueue({
                        type: "user.updated",
                        payload: {
                            userId: user.id,
                            changes: changes?.body || {},
                        },
                    });
                },
            },
        },
    },
});

async function sendDeleteAccountVerification({
    user,
    url,
}: {
    user: User;
    url: string;
}) {
    const name = user.name || user.email.split("@")[0];
    const subject = "Verify your account deletion";
    await enqueue({
        type: "email.sent",
        payload: {
            to: user.email,
            subject,
            body: await emailVerificationTemplate({
                name,
                heading: subject,
                action: { type: EmailType.Deletion, url },
            }),
        },
    });
}

async function sendVerificationEmail({
    user,
    url,
    token,
}: {
    user: User;
    url: string;
    token: string;
}) {
    const name = user.name || user.email.split("@")[0];
    const subject = "Verify your email address";
    await enqueue({
        type: "email.sent",
        payload: {
            to: user.email,
            subject,
            body: await emailVerificationTemplate({
                name,
                heading: subject,
                action: { type: EmailType.Verify, url },
            }),
        },
    });
}

async function sendVerificationOTP({
    email,
    otp,
    type,
}: {
    email: string;
    otp: string;
    type: "sign-in" | "email-verification" | "forget-password";
}) {
    const subject =
        type === "sign-in" ? "Your login OTP" : "Your verification OTP";
    await enqueue({
        type: "email.sent",
        payload: {
            to: email,
            subject,
            body: await emailVerificationTemplate({
                name: email,
                heading: subject,
                action: { type: EmailType.OTP, otp },
            }),
        },
    });
}

export const checkSession = async (request: Request) => {
    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session) {
        throw redirectToLogin(new URL(request.url).pathname);
    }

    return session;
};
