import { PropsWithChildren } from "react";
import LanguageSelector from "./languageSelector";
import { PrivacyPolicy } from "./service";
import Logo from "@/components/logo/main.svg?react";

export function AuthPageLayout({ children }: PropsWithChildren) {
    return (
        <div className="min-h-dvh w-full flex items-center justify-center p-4 flex-col gap-2">
            <Logo width={180} className="py-5" />

            {children}

            <PrivacyPolicy />
            <LanguageSelector />
        </div>
    );
}
