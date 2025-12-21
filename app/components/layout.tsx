import { PropsWithChildren } from "react";
import LanguageSelector from "./languageSelector";
import { PrivacyPolicy } from "./service";
import Logo from "@/components/logo/main.svg?react";
import { Separator } from "./ui/separator";

export function AuthPageLayout({ children }: PropsWithChildren) {
    return (
        <div className="min-h-dvh w-full flex items-center sm:justify-center p-4 flex-col gap-2 bg-card sm:bg-transparent">
            <Logo width={180} className="my-5 mt-10 sm:mt-0" />

            {children}

            <Separator className="sm:hidden my-3" />

            <div className="max-w-min text-center gap-2 flex flex-col min-w-full items-center">
                <PrivacyPolicy />
                <LanguageSelector />
            </div>
        </div>
    );
}
