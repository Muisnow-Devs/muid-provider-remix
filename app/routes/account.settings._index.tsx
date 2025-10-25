import { AccountsCard, UpdateNameCard } from "@daveyplate/better-auth-ui";

export default function AccountSettingsRoute() {
    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            <UpdateNameCard />
            <AccountsCard />
        </div>
    );
}