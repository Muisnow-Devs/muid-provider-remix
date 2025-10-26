import { randomBytes } from "crypto";
import { commitSession, getSession } from "./sessions";

export function generateCSRFToken() {
    return randomBytes(128).toString("hex");
}

export async function commitCSRFToken(headers: Headers) {
    const session = await getSession(headers.get("Cookie"));
    const csrfToken = generateCSRFToken();
    session.set("csrfToken", csrfToken);
    return {
        csrfToken,
        headers: {
            "Set-Cookie": await commitSession(session),
        },
    };
}

export async function validateCSRFToken(request: Request, csrfToken?: string) {
    const session = await getSession(request.headers.get("Cookie"));
    const storedToken = session.get("csrfToken");
    if (!storedToken || !csrfToken || storedToken !== csrfToken) {
        throw new Response("Invalid CSRF Token", { status: 403 });
    }
}
