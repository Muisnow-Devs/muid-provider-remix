import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import type { ReactNode } from "react";
import { authClient } from "./components/auth-client";

export function Providers({ children }: { children: ReactNode }) {
    return (
        <AuthUIProvider
            authClient={authClient}
            navigate={(path) => {
                window.location.href = path;
            }}
            credentials={false}
            passkey
            social={{
                providers: ["google", "github"],
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
