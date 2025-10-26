import { auth } from "@/.server/auth";
import provider from "@/.server/oidc";
import prisma from "@/.server/prisma";
import { commitCSRFToken, validateCSRFToken } from "@/.server/security";
import { authClient, redirectToLogin } from "@/components/auth-client";
import {
    Accordion,
    AccordionContent,
    AccordionTrigger,
} from "@/components/ui/accordion";
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
import { AccordionItem } from "@radix-ui/react-accordion";
import { Link2Icon } from "lucide-react";
import {
    data,
    isRouteErrorResponse,
    LoaderFunctionArgs,
    redirect,
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

    const interaction = await provider.Interaction.find(id);
    if (!interaction) {
        throw new Response("Interaction not found", { status: 404 });
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

    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session) {
        return redirectToLogin(encodeURIComponent("/authorize/" + id));
    }

    if (
        interaction.prompt.name === "login" ||
        interaction.session?.accountId != session.user.id
    ) {
        interaction.result = {
            login: { accountId: session.user.id, remember: true },
        };

        await interaction.save(interaction.exp - getEpochTime());
        return redirectDocument(interaction.returnTo, 303);
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
        session,
        params,
    } = interaction;

    const grantId = await prisma.oauthConsent
        .findFirst({
            where: {
                userId: interaction.session?.accountId!,
                clientId: interaction.params.client_id! as string,
            },
            select: { id: true },
        })
        .then((g) => g?.id);

    const grant =
        (grantId ? await provider.Grant.find(grantId) : null) ??
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

    if (grantId) {
        await prisma.oauthConsent.delete({
            where: { id: grantId },
        });
    }

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
                        {data.client.logo ? (
                            <img
                                src={data.client.logo}
                                alt={data.client.name}
                                width={48}
                                height={48}
                                className="w-12 h-12 rounded-md object-cover"
                            />
                        ) : (
                            <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center">
                                <span className="text-lg font-semibold">
                                    {data.client.name.charAt(0).toUpperCase()}
                                </span>
                            </div>
                        )}
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
                    <Accordion
                        type="multiple"
                        className="mb-4 font-medium flex flex-col gap-2"
                    >
                        {missing.map((s) => (
                            <AccordionItem value={s.id} key={s.id}>
                                <AccordionTrigger>{s.name}</AccordionTrigger>
                                <AccordionContent>
                                    <p className="text-sm text-muted-foreground">
                                        {s.description}
                                    </p>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>

                    {granted.length > 0 && (
                        <>
                            <h3 className="font-semibold mb-2 italic text-zinc-500">
                                You have already granted:
                            </h3>
                            <Accordion
                                type="multiple"
                                className="mb-4 font-medium flex flex-col gap-2"
                            >
                                {granted.map((s) => (
                                    <AccordionItem value={s.id} key={s.id}>
                                        <AccordionTrigger>
                                            {s.name}
                                        </AccordionTrigger>
                                        <AccordionContent>
                                            <p className="text-sm text-muted-foreground">
                                                {s.description}
                                            </p>
                                        </AccordionContent>
                                    </AccordionItem>
                                ))}
                            </Accordion>
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
                    <pre className="mt-4 rounded bg-gray-100 dark:bg-gray-800 p-4 overflow-x-auto text-sm">
                        {isRouteErrorResponse(error) &&
                            (error.data || "Unknown error")}
                    </pre>
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
