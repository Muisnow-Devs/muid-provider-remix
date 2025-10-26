import { checkSession } from "@/.server/auth";
import { AccountsCard, UpdateNameCard } from "@daveyplate/better-auth-ui";
import { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
    await checkSession(request);
}

export default function AccountSettingsRoute() {
    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            <UpdateNameCard />
            <AccountsCard />
        </div>
    );
}