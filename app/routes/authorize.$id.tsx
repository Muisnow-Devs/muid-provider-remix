import { checkSession } from "@/.server/auth";
import { findClient } from "@/.server/cache/clients";
import provider, { loadGrantByUserIdClientId } from "@/.server/oidc";
import { validateScope } from "@/.server/cache/scopes";
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
    redirectDocument,
    useFetcher,
    useLoaderData,
    useRouteError,
} from "react-router";
import { getInstance } from "@/.server/i18n";
import { Trans, useTranslation } from "react-i18next";
import { Route } from "./+types/authorize.$id";
import LanguageSelector from "@/components/languageSelector";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
    const { t } = getInstance(context);
    const { id } = params;
    if (!id) {
        throw new Response(t("errors:interaction.missing"), { status: 400 });
    }

    if (id === "error") {
        const url = new URL(request.url);
        const type = url.searchParams.get("type") || "unknown_error";
        const detail = url.searchParams.get("detail") || "No details provided";
        throw data(
            {
                title: t("authorize:title.error"),
                detail,
            },
            { status: 400 }
        );
    }

    const interaction = await provider.Interaction.find(id);
    if (!interaction) {
        throw data(
            {
                title: t("authorize:title.error"),
                detail: t("errors:interaction.notfound"),
            },
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
        throw data(
            {
                title: t("authorize:title.error"),
                detail: t("errors:client_id.missing"),
            },
            { status: 400 }
        );
    }

    const client = await findClient(clientId);
    if (!client) {
        throw data(
            {
                title: t("authorize:title.error"),
                detail: t("errors:client_id.notfound", { client_id: clientId }),
            },
            { status: 404 }
        );
    }

    const scopes = (
        (interaction.params.scope as string) ?? "openid profile email"
    ).split(" ");

    const scopeData = await validateScope(scopes);
    if (scopeData.invalidScopes?.length) {
        throw data(
            {
                title: t("authorize:title.error"),
                detail: t("errors:scopes.invalid", {
                    scopes: scopeData.invalidScopes.join(", "),
                }),
            },
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
            title: t("authorize:title.default", {
                app_name: client.name || client.clientId,
            }),
            client: {
                id: client.clientId,
                name: client.name || client.clientId!,
                logo: client.icon || undefined,
                scopes: scopeData.validScopes,
                missing: missingScopes,
            },
            csrf,
        },
        { headers: csrf.headers }
    );
}

export function meta({ loaderData, error }: Route.MetaArgs) {
    return [
        {
            title:
                (error
                    ? isRouteErrorResponse(error) && error.data.title
                    : loaderData
                      ? loaderData.title
                      : "Unknown error") + " - MuID",
        },
    ];
}

export async function action({
    params: pm,
    request,
    context,
}: LoaderFunctionArgs) {
    const { t } = getInstance(context);
    const formData = await request.formData();
    const authorize = formData.get("authorize") === "true";
    await validateCSRFToken(
        request,
        formData.get("csrfToken") as string | undefined
    );

    const { id } = pm;
    if (!id) {
        throw new Response(t("errors:interaction.missing"), { status: 400 });
    }

    const interaction = await provider.Interaction.find(id);
    if (!interaction) {
        throw new Response(t("errors:interaction.notfound"), { status: 404 });
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
        prompt: { details: promptDetails },
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
    const { t } = useTranslation("authorize");

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
        <div className="min-h-dvh w-full flex items-center justify-center p-4 flex-col gap-2">
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
                        {t("head_title")}
                    </CardTitle>
                    <CardDescription>
                        <Trans
                            ns="authorize"
                            i18nKey="head_description"
                            components={{
                                Application: (
                                    <span className="px-2 py-1 bg-white rounded text-black font-medium">
                                        {data.client.name}
                                    </span>
                                ),
                            }}
                        />
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ApplicationScopes scopes={missing} />

                    {granted.length > 0 && (
                        <>
                            <h3 className="font-semibold mb-2 italic text-zinc-500">
                                {t("granted")}
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
                                {t("button.authorize")}
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full cursor-pointer"
                                onClick={() => submit(false)}
                            >
                                {t("button.reject")}
                            </Button>
                        </>
                    )}
                </CardFooter>
            </Card>

            <LanguageSelector />
        </div>
    );
}

export function ErrorBoundary() {
    const error = useRouteError();
    const { t } = useTranslation("errors");
    console.error(error);

    return (
        <div className="min-h-dvh w-full flex items-center justify-center p-4 flex-col gap-2">
            <Card className="w-full max-w-lg">
                <CardHeader>
                    <CardTitle>{t("authorize.title")}</CardTitle>
                    <CardDescription>
                        {t("authorize.head_description")}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <p>{t("authorize.description")}</p>
                    <p className="mt-4 rounded bg-gray-100 dark:bg-gray-800 p-4 overflow-x-auto text-sm wrap-break-word w-full font-mono">
                        {isRouteErrorResponse(error) &&
                            (error.data.detail || "Unknown error")}
                        {!isRouteErrorResponse(error) &&
                            (error instanceof Error
                                ? error.message
                                : String(error))}
                    </p>
                </CardContent>
            </Card>

            <LanguageSelector />
        </div>
    );
}
