import { checkSession } from "@/.server/auth";
import { AccountsCard, UpdateNameCard, UpdateUsernameCard } from "@daveyplate/better-auth-ui";
import { LoaderFunctionArgs, MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
    return [
        { title: "Account Settings - MuID" },
    ]
}

export async function loader({ request }: LoaderFunctionArgs) {
    await checkSession(request);
}

export default function AccountSettingsRoute() {
    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            {/* <UpdateAvatarCard /> */}
            <UpdateUsernameCard />
            <UpdateNameCard />
            <AccountsCard />
        </div>
    );
}