import { AccountView } from "@daveyplate/better-auth-ui";
import { useParams } from "react-router";

export default function AccountPage() {
    const { path } = useParams();

    return (
        <main>
            <div className="container p-4 md:p-6 m-auto">
                <AccountView path={path} />
            </div>
        </main>
    );
}
