import { createCookieSessionStorage } from "react-router";

const { getSession, commitSession, destroySession } = createCookieSessionStorage({
    cookie: {
        name: "__session",
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: true,
        maxAge: 60 * 60 * 24 * 7,
        secrets: [process.env.SESSION_SECRET || "default_secret"],
    }
});

export { getSession, commitSession, destroySession };