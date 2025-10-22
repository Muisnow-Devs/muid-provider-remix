import { auth } from "@/.server/auth";
import provider from "@/.server/oidc";
import prisma from "@/.server/prisma";
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
    LoaderFunctionArgs,
    redirect,
    redirectDocument,
    useFetcher,
    useLoaderData,
} from "react-router";

const ScopeNames: Record<string, string> = {
    openid: "Your identity in MuID (OpenID)",
    profile: "Your basic profile information",
    email: "Your email address",
    offline_access: "Allow this app to access your data anytime",
};

export async function loader({ params, request }: LoaderFunctionArgs) {
    const { id } = params;
    if (!id) {
        throw new Response("Missing id", { status: 400 });
    }

    const interaction = await provider.Interaction.find(id);
    if (!interaction) {
        throw new Response("Interaction not found", { status: 404 });
    }

    const session = await auth.api.getSession({
        headers: request.headers,
    });

    if (!session) {
        return redirect(
            "/auth/sign-in?redirectTo=" + encodeURIComponent("/authorize/" + id)
        );
    }

    if (interaction.prompt.name === "login") {
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

    return {
        client: {
            name: client.name || client.clientId!,
            logo: client.icon || undefined,
            scopes: (
                (interaction.params.scope as string) ?? "openid profile email"
            ).split(" "),
        },
    };
}

export async function action({ params: pm, request }: LoaderFunctionArgs) {
    const { id } = pm;
    if (!id) {
        throw new Response("Missing id", { status: 400 });
    }

    const interaction = await provider.Interaction.find(id);
    if (!interaction) {
        throw new Response("Interaction not found", { status: 404 });
    }

    const formData = await request.formData();
    const authorize = formData.get("authorize") === "true";

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
        grantId,
        session,
        params,
    } = interaction;

    const grant =
        (grantId ? await provider.Grant.find(grantId) : null) ??
        new provider.Grant({
            accountId: interaction.session?.accountId!,
            clientId: interaction.params.client_id! as string,
        });

    if (promptDetails?.missingOIDCScope) {
        grant.addOIDCScope(
            (promptDetails.missingOIDCScope as string[]).join(" ")
        );
    }

    if (promptDetails?.missingOIDCClaims) {
        grant.addOIDCClaims(promptDetails.missingOIDCClaims as string[]);
    }

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
        fetcher.submit(formData, { method: "post" });
    }

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
                    <ul className="list-disc pl-5 space-y-1">
                        {data.client.scopes.map((s) => (
                            <li key={s} className="text-sm">
                                <span className="font-medium">
                                    {ScopeNames[s] || s}
                                </span>
                            </li>
                        ))}
                    </ul>

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
