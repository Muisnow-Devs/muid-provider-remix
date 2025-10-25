import { AuthView } from "@daveyplate/better-auth-ui";
import Logo from "@/components/logo/main.svg?react";
import { Link, useParams } from "react-router";

export default function AuthPage() {
    const { path } = useParams();

    return (
        <main className="w-full min-h-screen flex flex-col items-center justify-center p-4">
            <div className="container flex flex-col items-center m-auto">
                <Logo width={180} className="pb-5" />
                <AuthView path={path} />

                <div className="mt-4">
                    <Link
                        to="https://muisnowdevs.one/privacy"
                        className="text-sm text-center text-gray-500 mt-6"
                    >
                        Privacy Policy
                    </Link>
                </div>
            </div>
        </main>
    );
}