import { Link, Outlet, useLocation } from "react-router";
import Logo from "@/components/logo/main.svg?react";
import { LinkIcon, Shield, User2 } from "lucide-react";
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

const NAV = [
    { name: "Account Settings", href: "/account/settings", icon: User2 },
    { name: "Security", href: "/account/security", icon: Shield },
    { name: "Connected Apps", href: "/account/connect", icon: LinkIcon },
];

export default function AccountLayout() {
    const { pathname } = useLocation();
    const path = pathname.split("/").at(-1);

    return (
        <SidebarProvider>
            <Sidebar>
                <SidebarHeader className="grid place-items-center">
                    <Logo width={128} className="py-8" />
                </SidebarHeader>
                <SidebarContent>
                    <SidebarMenu className="px-2">
                        {NAV.map((item) => (
                            <SidebarMenuItem key={item.href + ":" + item.name}>
                                <SidebarMenuButton
                                    asChild
                                    isActive={pathname === item.href}
                                >
                                    <Link to={item.href}>
                                        <item.icon />
                                        {item.name}
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        ))}
                    </SidebarMenu>
                </SidebarContent>
                <SidebarFooter>
                    <Link
                        to="https://muisnowdevs.one/privacy"
                        className="text-sm text-center text-gray-500 mt-6 hover:text-zinc-50 px-2 py-1 rounded-md transition-colors"
                    >
                        Privacy Policy
                    </Link>
                    <UserButton />
                </SidebarFooter>
            </Sidebar>

            <div className="flex-1 p-4">
                <h1 className="font-bold mb-8 text-2xl">
                    <SidebarTrigger size="lg" className="m-auto mr-2" />

                    {{
                        settings: "Account Settings",
                        security: "Security",
                        connect: "Connected Apps",
                    }[path ?? ""] ?? "Account"}
                </h1>
                <Outlet />
            </div>
            {/* </div> */}
        </SidebarProvider>
    );
}
