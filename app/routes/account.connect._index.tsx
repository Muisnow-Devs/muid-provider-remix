import { checkSession } from "@/.server/auth";
import config from "@/.server/config";
import { ClientDetails, findClient } from "@/.server/cache/clients";
import { getLocale } from "@/.server/i18n";
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
import { CircleQuestionMarkIcon } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
    ActionFunctionArgs,
    LoaderFunctionArgs,
    MetaFunction,
    useFetcher,
    useLoaderData,
    useNavigate,
} from "react-router";

interface SimpleScopesDetails {
    id: string;
    name: string;
    description: string | null;
}

interface SimpleClientDetails {
    name: string | null;
    metadata: Record<string, unknown> | null;
    icon: string | null;
    isServiceAccount: boolean;
}

export const meta: MetaFunction = () => {
    return [{ title: "Connected Applications - MuID" }];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
    const session = await checkSession(request);

    const clientData = await prisma.oauthConsent.findMany({
        select: {
            id: true,
            clientId: true,
            scopes: true,
            createdAt: true,
        },
        where: {
            userId: session.user.id,
        },
    });
    const clientIds = clientData.map((c) => c.clientId);
    const applications = (
        await Promise.all(clientIds.map((id) => findClient(id)))
    )
        .filter((app): app is ClientDetails => app !== null)
        .map((app) => ({
            clientId: app.clientId,
            metadata: app.metadata,
            name: app.name,
            icon: app.icon,
            isServiceAccount: app.clientId.endsWith(config.serviceClientSuffix),
        }));

    const applicationsMap: Record<string, SimpleClientDetails> =
        Object.fromEntries(applications.map((app) => [app.clientId, app]));

    const scopesList = new Set(
        clientData
            .filter((e) => e.scopes !== null)
            .flatMap((c) => c.scopes!.split(" "))
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
        {} as Record<string, SimpleScopesDetails>
    );

    return {
        connectedApps: clientData.map((app) => ({
            ...app,
            oauthapplication: applicationsMap[app.clientId],
            scopes: app.scopes!.split(" "),
            createdAt: app.createdAt.toLocaleString(getLocale(context)),
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
        throw new Response("Grant not found", { status: 404 });
    }

    const clientId = grant?.clientId;
    await grant.destroy();

    await enqueue({
        type: "user.revoked",
        payload: {
            userId: session.user.id,
            clientId: clientId ?? "",
        },
    });

    return new Response(null, { status: 204 });
}

export default function AccountConnectRoute() {
    const data = useLoaderData<typeof loader>();
    const navigate = useNavigate();
    const fetcher = useFetcher<typeof action>();
    const auth = authClient.useSession();

    useEffect(() => {
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

            {data.connectedApps.map((app) => (
                <AuthorizedApplicationCard
                    key={app.id}
                    id={app.clientId}
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
    detail: SimpleClientDetails;
    scopes: SimpleScopesDetails[];
    createdAt: string;
    handleRevoke: () => void;
}

function AuthorizedApplicationCard({
    detail,
    createdAt,
    scopes,
    handleRevoke,
}: Readonly<AuthorizedApplicationCardProps>) {
    const { t: bT } = useTranslation();
    const { t } = useTranslation("accounts");

    return (
        <AlertDialog>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>
                        {t("applications.revoke.title")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        {t("applications.revoke.description")}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel className="cursor-pointer">
                        {bT("cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-white hover:bg-rose-800 cursor-pointer"
                        onClick={() => handleRevoke()}
                    >
                        {bT("confirm")}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>

            <Card>
                <CardHeader>
                    <div className="flex items-center gap-4 mb-2">
                        <ApplicationIcon
                            isServiceAccount={detail.isServiceAccount}
                            icon={detail.icon}
                            name={detail.name ?? "OAuth Application"}
                        />
                        <h2>{detail.name}</h2>
                    </div>
                    <p>
                        {t("applications.connected_on", {
                            date: createdAt,
                            interpolation: { escapeValue: false },
                        })}
                    </p>
                </CardHeader>
                <CardContent>
                    <h3 className="text-xl mb-2">
                        {t("applications.granted")}
                    </h3>
                    <ApplicationScopes scopes={scopes} />
                </CardContent>
                <CardFooter className="flex justify-end">
                    <AlertDialogTrigger asChild>
                        <Button
                            variant="destructive"
                            className="cursor-pointer"
                        >
                            {t("applications.revoke.button")}
                        </Button>
                    </AlertDialogTrigger>
                </CardFooter>
            </Card>
        </AlertDialog>
    );
}
