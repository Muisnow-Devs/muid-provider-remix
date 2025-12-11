import { authClient } from "@/components/auth-client";
import { AuthPageLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { redirectToLogin, sanitizeReturnTo } from "@/utils";
import { UserAvatar } from "@daveyplate/better-auth-ui";
import { Session, User } from "better-auth";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionFunctionArgs, redirect, useFetcher } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
    const query = new URL(request.url).searchParams;
    const returnTo = query.get("redirectTo") || "/";

    if (request.method === "PUT") {
        return redirectToLogin(returnTo);
    }

    return redirect(sanitizeReturnTo(returnTo), 303);
}

export default function AccountSelector() {
    const fetcher = useFetcher();
    const user = authClient.useSession();
    const [accounts, setAccounts] = useState<
        | {
              session: Session;
              user: User;
          }[]
        | null
    >(null);

    useEffect(() => {
        async function fetchAccounts() {
            const session = await authClient.multiSession
                .listDeviceSessions()
                .catch(() => null);
            if (!session) return;
            setAccounts(session.data?.filter(Boolean) ?? []);
        }

        fetchAccounts();
    }, []);

    async function handleAccountSwitch(token: string) {
        await authClient.multiSession.setActive({
            sessionToken: token,
        });

        await fetcher.submit({}, { method: "POST" });
    }

    async function handleLoginDifferentAccount() {
        await fetcher.submit({}, { method: "PUT" });
    }

    return (
        <AuthPageLayout>
            <Card className="w-full max-w-lg">
                <CardHeader className="text-center pb-4">
                    <CardTitle className="text-2xl">
                        Select an Account
                    </CardTitle>
                    <CardDescription>
                        Please select an account to continue.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col gap-1">
                        {accounts === null && (
                            <Loader2 className="animate-spin w-full text-center" />
                        )}
                        {accounts?.length === 0 && (
                            <p>No available accounts found.</p>
                        )}
                        {accounts?.map((account) => (
                            <Button
                                key={account.session.id}
                                className="w-full flex flex-row justify-start cursor-pointer"
                                variant="outline"
                                onClick={() =>
                                    handleAccountSwitch(account.session.token)
                                }
                            >
                                <UserAvatar user={account.user} size="sm" />
                                <span className="ml-2">
                                    {account.user.name || account.user.email}
                                </span>
                                <span className="ml-auto text-sm italic text-gray-500">
                                    {account.session.id ===
                                    user.data?.session.id
                                        ? "Current"
                                        : ""}
                                </span>
                            </Button>
                        ))}
                    </div>
                </CardContent>
                <CardFooter className="gap-2 flex flex-col">
                    <Button
                        className="w-full cursor-pointer"
                        onClick={handleLoginDifferentAccount}
                    >
                        Login to a different account
                    </Button>
                </CardFooter>
            </Card>
        </AuthPageLayout>
    );
}
