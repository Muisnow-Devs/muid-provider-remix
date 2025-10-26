import {
    adminClient,
    emailOTPClient,
    lastLoginMethodClient,
    multiSessionClient,
    oidcClient,
    passkeyClient,
    usernameClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { redirect } from "react-router";

export const authClient = createAuthClient({
    plugins: [
        oidcClient(),
        lastLoginMethodClient(),
        passkeyClient(),
        adminClient(),
        usernameClient(),
        multiSessionClient(),
        emailOTPClient(),
    ],
});

export const redirectToLogin = (url: string) => {
    return redirect("/auth/sign-in?redirectTo=" + encodeURIComponent(url));
}