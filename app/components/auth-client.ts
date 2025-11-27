import {
    adminClient,
    emailOTPClient,
    lastLoginMethodClient,
    multiSessionClient,
    oidcClient,
    usernameClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
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