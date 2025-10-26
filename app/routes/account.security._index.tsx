import { checkSession } from "@/.server/auth";
import {
    DeleteAccountCard,
    PasskeysCard,
    ProvidersCard,
    SessionsCard,
} from "@daveyplate/better-auth-ui";
import { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
    await checkSession(request);
}

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
