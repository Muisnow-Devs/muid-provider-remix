import { AuthView, authViewPaths } from "@daveyplate/better-auth-ui";
import { MetaFunction, useParams } from "react-router";
import { AuthPageLayout } from "@/components/layout";

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
        <AuthPageLayout>
            <AuthView
                path={path}
                classNames={{
                    base: "bg-transparent sm:bg-card border-none sm:border shadow-none max-w-full sm:max-w-sm",
                    header: "px-0 sm:px-6",
                    content: "px-0 sm:px-6",
                }}
            />
        </AuthPageLayout>
    );
}
