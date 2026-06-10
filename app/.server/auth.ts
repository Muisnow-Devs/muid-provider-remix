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
    EmailAction,
    EmailType,
} from "./templates/emailVerification";
import { SocialProviders } from "better-auth/social-providers";
import { redirectToLogin } from "@/utils";

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
        provider: "mysql",
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

async function enqueueTemplateEmail({
    to,
    name,
    subject,
    action,
}: {
    to: string;
    name: string;
    subject: string;
    action: EmailAction;
}) {
    await enqueue({
        type: "email.sent",
        payload: {
            to,
            subject,
            body: await emailVerificationTemplate({
                name,
                heading: subject,
                action,
            }),
        },
    });
}

async function sendDeleteAccountVerification({
    user,
    url,
}: {
    user: User;
    url: string;
}) {
    await enqueueTemplateEmail({
        to: user.email,
        name: user.name || user.email.split("@")[0],
        subject: "Verify your account deletion",
        action: { type: EmailType.Deletion, url },
    });
}

async function sendVerificationEmail({
    user,
    url,
}: {
    user: User;
    url: string;
    token: string;
}) {
    await enqueueTemplateEmail({
        to: user.email,
        name: user.name || user.email.split("@")[0],
        subject: "Verify your email address",
        action: { type: EmailType.Verify, url },
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
    await enqueueTemplateEmail({
        to: email,
        name: email,
        subject: type === "sign-in" ? "Your login OTP" : "Your verification OTP",
        action: { type: EmailType.OTP, otp },
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
