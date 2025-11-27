import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import type { PropsWithChildren } from "react";
import { authClient } from "./components/auth-client";
import { useTranslation } from "react-i18next";

export function Providers({ children }: Readonly<PropsWithChildren>) {
    const { i18n } = useTranslation();

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
            captcha={{
                provider: "cloudflare-turnstile",
                siteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
                endpoints: ["/email-otp/send-verification-otp"],
            }}
            changeEmail={false}
            localization={i18n.getResourceBundle(i18n.language, "bau")}
        >
            {children}
        </AuthUIProvider>
    );
}
