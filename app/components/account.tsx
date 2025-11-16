import { Link } from "react-router";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { PropsWithChildren } from "react";

interface AccountNavButtonProps extends PropsWithChildren {
    to: string;
    isSelected: boolean;
}

export function AccountNavButton({
    isSelected,
    children,
    to,
}: Readonly<AccountNavButtonProps>) {
    return (
        <Link to={to}>
            <Button
                className={cn(
                    "w-full cursor-pointer font-bold justify-start",
                    !isSelected && "bg-transparent"
                )}
                size="lg"
            >
                {children}
            </Button>
        </Link>
    );
}
