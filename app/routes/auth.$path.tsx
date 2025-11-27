import { AuthView, authViewPaths } from "@daveyplate/better-auth-ui";
import Logo from "@/components/logo/main.svg?react";
import { MetaFunction, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import LanguageSelector from "@/components/languageSelector";
import { PrivacyPolicy } from "@/components/service";

export const meta: MetaFunction = ({ params }) => {
    const { path } = params;

    const titles: Record<string, string> = {
        [authViewPaths.CALLBACK]: "Callback",
        [authViewPaths.EMAIL_OTP]: "Email Verification",
        [authViewPaths.FORGOT_PASSWORD]: "Forgot Password",
        [authViewPaths.MAGIC_LINK]: "Magic Link",
        [authViewPaths.RECOVER_ACCOUNT]: "Recover Account",
        [authViewPaths.RESET_PASSWORD]: "Reset Password",
        [authViewPaths.SIGN_IN]: "Sign In",
        [authViewPaths.SIGN_OUT]: "Sign Out",
        [authViewPaths.SIGN_UP]: "Sign Up",
        [authViewPaths.TWO_FACTOR]: "Two-Factor Authentication",
        [authViewPaths.ACCEPT_INVITATION]: "Accept Invitation",
    };

    return [
        {
            title:
                titles[path as keyof typeof titles] + " - MuID" ||
                "Authentication - MuID",
        },
    ];
};

export default function AuthPage() {
    const { path } = useParams();

    return (
        <main className="w-full min-h-screen flex flex-col items-center justify-center p-4">
            <div className="container flex flex-col items-center m-auto">
                <Logo width={180} className="py-5" />
                <AuthView path={path} />

                <div className="flex flex-col items-center justify-center gap-4 mt-6">
                    <PrivacyPolicy />
                    <LanguageSelector />
                </div>
            </div>
        </main>
    );
}
