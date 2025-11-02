import { checkSession } from "@/.server/auth";
import provider from "@/.server/oidc";
import prisma from "@/.server/prisma";
import { enqueue } from "@/.server/queue/default";
import { ApplicationIcon, ApplicationScopes } from "@/components/application";
import { authClient } from "@/components/auth-client";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
} from "@/components/ui/card";
import handleRequest from "@/entry.server";
import { CircleQuestionMarkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
    ActionFunctionArgs,
    LoaderFunctionArgs,
    MetaFunction,
    useFetcher,
    useLoaderData,
    useNavigate,
} from "react-router";

export const meta: MetaFunction = () => {
    return [{ title: "Connected Applications - MuID" }];
};

export async function loader({ request }: LoaderFunctionArgs) {
    const session = await checkSession(request);

    const clientData = await prisma.oauthConsent.findMany({
        select: {
            id: true,
            clientId: true,
            scopes: true,
            createdAt: true,
            oauthapplication: {
                select: {
                    name: true,
                    metadata: true,
                    icon: true,
                },
            },
        },
        where: {
            userId: session.user.id,
        },
    });

    const scopesList = new Set(
        clientData
            .filter((e) => e.scopes !== null)
            .map((c) => c.scopes!.split(" "))
            .flat()
    );

    const scopesData = (
        await prisma.oidcScope.findMany({
            select: {
                id: true,
                name: true,
                description: true,
            },
            where: {
                id: { in: Array.from(scopesList) },
            },
        })
    ).reduce(
        (acc, curr) => ({ ...acc, [curr.id]: curr }),
        {} as Record<
            string,
            { id: string; name: string; description: string | null }
        >
    );

    return {
        connectedApps: clientData.map((app) => ({
            ...app,
            scopes: app.scopes!.split(" "),
        })),
        scopesData,
    };
}

export async function action({ request }: ActionFunctionArgs) {
    const form = await request.formData();
    const grantId = form.get("grantId") as string;

    const session = await checkSession(request);
    const grant = await provider.Grant.find(grantId);

    if (!grant || grant.accountId !== session.user.id) {
        return null;
    }

    const clientId = grant?.clientId;
    grant && (await grant.destroy());

    await enqueue({
        type: "user.revoked",
        payload: {
            userId: session.user.id,
            clientId: clientId ?? "",
        },
    });

    return null;
}

export default function AccountConnectRoute() {
    const data = useLoaderData<typeof loader>();
    const navigate = useNavigate();
    const fetcher = useFetcher<typeof action>();
    const auth = authClient.useSession();

    useEffect(() => {
        console.log("Auth session changed, reloading connected apps");
        navigate(".");
    }, [auth.data, fetcher.state]);

    function handleRevoke(id: string) {
        const formData = new FormData();
        formData.append("grantId", id);
        fetcher.submit(formData, { method: "DELETE" });
    }

    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            {data.connectedApps.length === 0 && (
                <div className="flex flex-col items-center justify-center mt-20 text-muted-foreground gap-4">
                    <CircleQuestionMarkIcon />
                    <p>No connected applications found.</p>
                </div>
            )}

            {data.connectedApps.map((app, index) => (
                <AuthorizedApplicationCard
                    key={index}
                    id={app.id}
                    detail={app.oauthapplication}
                    createdAt={app.createdAt}
                    scopes={app.scopes.map((s) => data.scopesData[s])}
                    handleRevoke={() => handleRevoke(app.id)}
                />
            ))}
        </div>
    );
}

interface AuthorizedApplicationCardProps {
    id: string;
    detail: {
        name: string | null;
        metadata: string | null;
        icon: string | null;
    };
    scopes: { id: string; name: string; description: string | null }[];
    createdAt: Date;
    handleRevoke: () => void;
}

function AuthorizedApplicationCard({
    id,
    detail,
    createdAt,
    scopes,
    handleRevoke,
}: AuthorizedApplicationCardProps) {
    return (
        <AlertDialog>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        Are you absolutely sure?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        This action is irreversible. Revoking the application's
                        access may also cause the application to delete any data
                        linked to your MuID account.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel className="cursor-pointer">
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-white hover:bg-rose-800 cursor-pointer"
                        onClick={() => handleRevoke()}
                    >
                        Continue
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-4 mb-2">
                        <ApplicationIcon
                            clientId={id}
                            icon={detail.icon}
                            name={detail.name ?? "OAuth Application"}
                        />
                        <h2>{detail.name}</h2>
                    </div>
                    <p>Connected At: {new Date(createdAt).toLocaleString()}</p>
                </CardHeader>
                <CardContent>
                    <h3 className="text-xl mb-2">Granted Scopes:</h3>
                    <ApplicationScopes scopes={scopes} />
                </CardContent>
                <CardFooter className="flex justify-end">
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="destructive"
                            className="cursor-pointer"
                        >
                            Revoke Access
                        </Button>
                    </AlertDialogTrigger>
                </CardFooter>
            </Card>
        </AlertDialog>
    );
}
