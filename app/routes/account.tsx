import { Link, Outlet, useLocation } from "react-router";
import Logo from "@/components/logo/main.svg?react";
import { LinkIcon, LucideIcon, Shield, User2 } from "lucide-react";
import { UserButton } from "@daveyplate/better-auth-ui";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
} from "@/components/ui/sidebar";
import { useTranslation } from "react-i18next";
import LanguageSelector from "@/components/languageSelector";
import { PrivacyPolicy } from "@/components/service";

export default function AccountLayout() {
    const { pathname } = useLocation();
    const { t } = useTranslation("accounts");

    const NAV: Record<string, { name: string; icon: LucideIcon }> = {
        "/account/settings": {
            name: t("sidebar.account"),
            icon: User2,
        },
        "/account/security": {
            name: t("sidebar.security"),
            icon: Shield,
        },
        "/account/connect": {
            name: t("sidebar.connected"),
            icon: LinkIcon,
        },
    };

    return (
        <SidebarProvider>
            <Sidebar>
                <SidebarHeader className="grid place-items-center">
                    <Logo width={128} className="py-8" />
                </SidebarHeader>
                <SidebarContent>
                    <SidebarMenu className="px-2">
                        {Object.entries(NAV).map(([href, item]) => (
                            <SidebarMenuItem key={href + ":" + item.name}>
                                <SidebarMenuButton
                                    asChild
                                    isActive={pathname === href}
                                >
                                    <Link to={href}>
                                        <item.icon />
                                        {item.name}
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarContent>
                <SidebarFooter>
                    <div className="flex flex-col items-center w-full gap-2">
                        <PrivacyPolicy />
                        <LanguageSelector className="w-full" />
                    </div>
                    <UserButton />
                </SidebarFooter>
            </Sidebar>

            <div className="flex-1 p-4">
                <h1 className="font-bold mb-8 text-2xl">
                    <SidebarTrigger size="lg" className="m-auto mr-2" />

                    {NAV[pathname]?.name}
                </h1>
                <Outlet />
            </div>
        </SidebarProvider>
    );
}
