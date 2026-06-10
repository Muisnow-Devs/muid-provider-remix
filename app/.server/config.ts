/**
 * Centralized, env-driven deployment configuration.
 *
 * Defaults preserve the previously hardcoded deployment-domain values.
 */

function parseDomainList(value: string | undefined, fallback: string): string[] {
    return (value ?? fallback)
        .split(",")
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean);
}

/**
 * Reads an env var, trimming whitespace and falling back to the default when
 * unset or blank. Prevents whitespace-padded values from silently breaking
 * suffix matching (which would fail open for the corp email restriction).
 */
function envString(value: string | undefined, fallback: string): string {
    const trimmed = value?.trim();
    return trimmed || fallback;
}

export interface DeploymentConfig {
    /** Client ID suffix identifying corp-internal clients. */
    corpClientSuffix: string;
    /** Email domains (lowercased) allowed to sign in to corp clients. */
    corpAllowedEmailDomains: string[];
    /** Client ID suffix identifying privileged service-account clients. */
    serviceClientSuffix: string;
    /** Default OAuth resource indicator when none is requested. */
    oidcDefaultResource: string;
}

export const config: DeploymentConfig = {
    corpClientSuffix: envString(
        process.env.CORP_CLIENT_SUFFIX,
        ".corp.sanzi.io"
    ),
    corpAllowedEmailDomains: parseDomainList(
        process.env.CORP_ALLOWED_EMAIL_DOMAINS,
        "sanzi.io,muisnowdevs.one"
    ),
    serviceClientSuffix: envString(
        process.env.SERVICE_CLIENT_SUFFIX,
        ".service.sanzi.io"
    ),
    oidcDefaultResource: envString(
        process.env.OIDC_DEFAULT_RESOURCE,
        "https://api.muisnowdevs.one"
    ),
};

export default config;
