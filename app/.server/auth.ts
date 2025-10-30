import { betterAuth, User } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { passkey } from "better-auth/plugins/passkey";
import {
    lastLoginMethod,
    admin,
    username,
    multiSession,
    emailOTP,
} from "better-auth/plugins";
import prisma from "./prisma";
import { enqueue } from "./queue/default";
import emailVerificationTemplate, {
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
        username(),
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
            }
        },
    },
    databaseHooks: {
        user: {
            update: {
                after: async (user, changes) => {
                    await enqueue({
                        type: "uesr.updated",
                        payload: {
                            userId: user.id,
                            changes: changes?.body || {},
                        },
                    });
                }
            }
        }
    }
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
