/**
 * Shared helpers for handling space-delimited OAuth/OIDC scope strings.
 */

/**
 * Standard scopes defined by OpenID Connect
 */
export const OIDC_STANDARD_SCOPES = [
    "openid",
    "profile",
    "email",
    "address",
    "phone",
    "offline_access",
] as const;

/**
 * Split a space-delimited scope string into individual scope values
 */
export function splitScopes(scopeString: string): string[] {
    return scopeString.split(" ");
}

/**
 * Join individual scope values into a space-delimited scope string
 */
export function joinScopes(scopes: string[]): string {
    return scopes.join(" ");
}

/**
 * Filter a list of scopes down to the standard OIDC scopes
 */
export function filterOidcScopes(scopes: string[]): string[] {
    return scopes.filter((s) =>
        (OIDC_STANDARD_SCOPES as readonly string[]).includes(s)
    );
}
