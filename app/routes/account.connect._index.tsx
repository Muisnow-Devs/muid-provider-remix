import { auth } from "@/.server/auth";
import prisma from "@/.server/prisma";
import { ApplicationIcon, ApplicationScopes } from "@/components/application";
import { redirectToLogin } from "@/components/auth-client";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardFooter,
    CardHeader,
} from "@/components/ui/card";
import { CircleQuestionMarkIcon } from "lucide-react";
import { LoaderFunctionArgs, MetaFunction, useLoaderData } from "react-router";

export const meta: MetaFunction = () => {
    return [
        { title: "Connected Applications - MuID" },
    ];
}

export async function loader({ request }: LoaderFunctionArgs) {
    const session = await auth.api.getSession({
        headers: request.headers,
    });
    if (!session) {
        return redirectToLogin(encodeURIComponent("/account/connect"));
    }

    const clientData = await prisma.oauthConsent.findMany({
        select: {
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

export default function AccountConnectRoute() {
    const data = useLoaderData<typeof loader>();

    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto">
            {data.connectedApps.length === 0 && (
                <div className="flex flex-col items-center justify-center mt-20 text-muted-foreground gap-4">
                    <CircleQuestionMarkIcon />
                    <p>No connected applications found.</p>
                </div>
            )}

            {data.connectedApps.map((app, index) => (
                <Card>
                    <CardHeader>
                        <div className="flex items-center gap-4 mb-2">
                            <ApplicationIcon
                                icon={app.oauthapplication!.icon}
                                name={
                                    app.oauthapplication!.name ??
                                    "OAuth Application"
                                }
                            />
                            <h2>{app.oauthapplication!.name}</h2>
                        </div>
                        <p>
                            Connected At:{" "}
                            {new Date(app.createdAt!).toLocaleString()}
                        </p>
                    </CardHeader>
                    <CardContent>
                        <h3 className="text-xl mb-2">Granted Scopes:</h3>
                        <ApplicationScopes scopes={app.scopes.map(e => data.scopesData[e])} />
                    </CardContent>
                    <CardFooter className="flex justify-end">
                        <Button variant="destructive">Revoke Access</Button>
                    </CardFooter>
                </Card>
            ))}
        </div>
    );
}
