import {
    DeleteAccountCard,
    PasskeysCard,
    ProvidersCard,
    SessionsCard,
} from "@daveyplate/better-auth-ui";

export default function AccountSecurityRoute() {
    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            <ProvidersCard />
            <PasskeysCard />
            <SessionsCard />
            <DeleteAccountCard />
        </div>
    );
}
