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