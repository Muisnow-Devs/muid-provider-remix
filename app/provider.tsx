import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import type { PropsWithChildren } from "react";
import { authClient } from "./components/auth-client";

export function Providers({ children }: Readonly<PropsWithChildren>) {
    return (
        <AuthUIProvider
            authClient={authClient}
            navigate={(path) => {
                window.location.href = path;
            }}
            credentials={false}
            passkey
            social={{
                providers: ["google"],
            }}
            multiSession
            emailOTP
            deleteUser={{
                verification: true,
            }}
            changeEmail={false}
        >
            {children}
        </AuthUIProvider>
    );
}
