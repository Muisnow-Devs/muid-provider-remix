import { createCookieSessionStorage } from "react-router";

// Validate SESSION_SECRET is set
if (!process.env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET must be set and cannot be a default value');
}

const { getSession, commitSession, destroySession } = createCookieSessionStorage({
    cookie: {
        name: "__session",
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: true,
        maxAge: 60 * 60 * 24 * 7,
        secrets: [process.env.SESSION_SECRET],
    }
});

export { getSession, commitSession, destroySession };