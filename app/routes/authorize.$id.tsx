import { checkSession } from "@/.server/auth";
import provider, { loadGrantByUserIdClientId } from "@/.server/oidc";
import prisma from "@/.server/prisma";
import { commitCSRFToken, validateCSRFToken } from "@/.server/security";
import { ApplicationIcon, ApplicationScopes } from "@/components/application";
import { authClient } from "@/components/auth-client";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { getEpochTime } from "@/lib/utils";
import { UserAvatar } from "@daveyplate/better-auth-ui";
import { Link2Icon } from "lucide-react";
import {
    data,
    isRouteErrorResponse,
    LoaderFunctionArgs,
    MetaFunction,
    redirectDocument,
    useFetcher,
    useLoaderData,
    useRouteError,
} from "react-router";

export async function loader({ params, request }: LoaderFunctionArgs) {
    const { id } = params;
    if (!id) {
        throw new Response("Missing interaction id", { status: 400 });
    }

    if (id === "error") {
        const url = new URL(request.url);
        const type = url.searchParams.get("type") || "unknown_error";
        const detail = url.searchParams.get("detail") || "No details provided";
        throw new Response(detail, { status: 400 });
    }

    const interaction = await provider.Interaction.find(id);
    if (!interaction) {
        throw new Response(
            "Interaction not found, the session might be expired. Please start a new session.",
            { status: 404 }
        );
    }

    const session = await checkSession(request);

    if (
        interaction.prompt.name === "login" ||
        interaction.session?.accountId != session.user.id
    ) {
        interaction.result = {
            login: { accountId: session.user.id, remember: false },
        };

        await interaction.save(interaction.exp - getEpochTime());
        return redirectDocument(interaction.returnTo, 303);
    }

    if (!interaction.grantId) {
        const grant = await loadGrantByUserIdClientId(
            interaction.session?.accountId,
            interaction.params.client_id as string | undefined
        );
        if (grant) {
            interaction.grantId = grant;
            await interaction.save(interaction.exp - getEpochTime());
            return redirectDocument(interaction.returnTo, 303);
        }
    }

    const clientId = interaction.params.client_id as string | undefined;
    if (!clientId) {
        throw new Response("Interaction client_id not found", { status: 400 });
    }

    const client = await prisma.oauthApplication.findUnique({
        where: { clientId },
    });
    if (!client) {
        throw new Response("Client not found", { status: 404 });
    }

    const scopes = (
        (interaction.params.scope as string) ?? "openid profile email"
    ).split(" ");

    const scopeData = await prisma.oidcScope.findMany({
        where: { id: { in: scopes } },
        select: { name: true, description: true, id: true },
    });

    const requestedScopes = scopes;
    const foundScopes = scopeData.map((s) => s.id);
    const invalidScopes = requestedScopes.filter(
        (s) => !foundScopes.includes(s)
    );

    if (invalidScopes.length) {
        throw new Response(
            `Invalid scopes requested: ${invalidScopes.join(", ")}`,
            { status: 400 }
        );
    }

    const missingOIDCScopes = interaction.prompt.details?.missingOIDCScope as
        | string[]
        | undefined;

    const missingResourceScopes = interaction.prompt.details
        ?.missingResourceScopes as
        | { [indicator: string]: string[] }
        | undefined;

    const missingScopes = [
        ...(missingOIDCScopes || []),
        ...(missingResourceScopes
            ? Object.values(missingResourceScopes).flat()
            : []),
    ];

    const csrf = await commitCSRFToken(request.headers);
    return data(
        {
            client: {
                id: client.clientId,
                name: client.name || client.clientId!,
                logo: client.icon || undefined,
                scopes: scopeData,
                missing: missingScopes,
            },
            csrf,
        },
        { headers: csrf.headers }
    );
}

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => {
    return [
        {
            title: loaderData
                ? `Authorize ${loaderData.client.name} - MuID`
                : "Authorize Error - MuID",
        },
    ];
};

export async function action({ params: pm, request }: LoaderFunctionArgs) {
    const formData = await request.formData();
    const authorize = formData.get("authorize") === "true";
    await validateCSRFToken(
        request,
        formData.get("csrfToken") as string | undefined
    );

    const { id } = pm;
    if (!id) {
        throw new Response("Missing id", { status: 400 });
    }

    const interaction = await provider.Interaction.find(id);
    if (!interaction) {
        throw new Response("Interaction not found", { status: 404 });
    }

    if (!authorize) {
        interaction.result = {
            error: "access_denied",
            error_description: "End-user denied the authorization request",
        };
        await interaction.save(interaction.exp - getEpochTime());
        return redirectDocument(interaction.returnTo, 303);
    }

    const {
        prompt: { name, details: promptDetails },
    } = interaction;

    const existingGrant = await loadGrantByUserIdClientId(
        interaction.session?.accountId,
        interaction.params.client_id as string | undefined
    );

    const grant =
        (existingGrant ? await provider.Grant.find(existingGrant) : null) ??
        new provider.Grant({
            accountId: interaction.session?.accountId!,
            clientId: interaction.params.client_id! as string,
        });

    if (promptDetails?.missingResourceScopes) {
        for (const [indicator, scopes] of Object.entries(
            promptDetails.missingResourceScopes
        )) {
            grant.addResourceScope(indicator, (scopes as string[]).join(" "));
        }
    }

    const gi = await grant.save();

    interaction.result = {
        ...interaction.lastSubmission,
        consent: { grantId: gi },
    };

    await interaction.save(interaction.exp - getEpochTime());
    return redirectDocument(interaction.returnTo, 303);
}

export default function AuthorizePage() {
    const data = useLoaderData<typeof loader>();
    const user = authClient.useSession();
    const fetcher = useFetcher<typeof action>();

    async function submit(authorize: boolean) {
        const formData = new FormData();
        formData.append("authorize", authorize ? "true" : "false");
        formData.append("csrfToken", data.csrf.csrfToken);
        fetcher.submit(formData, { method: "post" });
    }

    const granted = data.client.scopes.filter(
        (s) => !data.client.missing.includes(s.id)
    );
    const missing = data.client.scopes.filter((s) =>
        data.client.missing.includes(s.id)
    );

    return (
        <div className="min-h-dvh w-full flex items-center justify-center p-4">
            <Card className="w-full max-w-lg">
                <CardHeader className="text-center pb-4">
                    <div className="flex items-center mb-2 gap-4 justify-center">
                        <ApplicationIcon
                            clientId={data.client.id}
                            icon={data.client.logo || null}
                            name={data.client.name}
                        />
                        <Link2Icon />
                        <UserAvatar user={user.data?.user} size="xl" />
                    </div>
                    <CardTitle className="text-2xl">
                        Authorize application
                    </CardTitle>
                    <CardDescription>
                        Application
                        <span className="px-1">{data.client.name}</span>
                        is requesting the following permissions:
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ApplicationScopes scopes={missing} />

                    {granted.length > 0 && (
                        <>
                            <h3 className="font-semibold mb-2 italic text-zinc-500">
                                You have already granted:
                            </h3>
                            <ApplicationScopes scopes={granted} />
                        </>
                    )}

                    {/* {error && (
                        <p className="text-sm text-destructive mt-4">{error}</p>
                    )} */}
                </CardContent>
                <CardFooter className="gap-2 flex flex-col">
                    {fetcher.state === "loading" && (
                        <Button disabled variant="outline" className="w-full">
                            <Spinner className="size-4" />
                        </Button>
                    )}
                    {fetcher.state === "idle" && (
                        <>
                            <Button
                                className="w-full cursor-pointer"
                                onClick={() => submit(true)}
                            >
                                Authorize
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full cursor-pointer"
                                onClick={() => submit(false)}
                            >
                                Reject
                            </Button>
                        </>
                    )}
                </CardFooter>
            </Card>
        </div>
    );
}

export function ErrorBoundary() {
    const error = useRouteError();

    return (
        <div className="min-h-dvh w-full flex items-center justify-center p-4">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle>Authorize failed</CardTitle>
                    <CardDescription>
                        Unable to authorize the OAuth client.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p>
                        The OAuth client is missing or invalid. If you believe
                        this is an error, contact the application owner. Below
                        is more information about the error.
                    </p>
                    <p className="mt-4 rounded bg-gray-100 dark:bg-gray-800 p-4 overflow-x-auto text-sm wrap-break-word w-full font-mono">
                        {isRouteErrorResponse(error) &&
                            (error.data || "Unknown error")}
                    </p>
                </CardContent>
                <CardFooter className="gap-2 flex flex-col">
                    <Button className="w-full">Go to Home</Button>
                    {/* <Button variant="outline" className="w-full">
                        Contact Support
                    </Button> */}
                </CardFooter>
            </Card>
        </div>
    );
}
