class ParametersMissingError extends Error {
    constructor(paramNames: string[]) {
        super(`Missing required parameters: ${paramNames.join(", ")}`);
        this.name = "ParametersMissingError";
    }
}

class OAuthClientNotFoundError extends Error {
    constructor(clientId: string) {
        super(`OAuth client with ID ${clientId} not found.`);
        this.name = "OAuthClientNotFoundError";
    }
}

class OAuthInteractionInvalidError extends Error {
    constructor(message = "OAuth interaction is invalid or has expired") {
        super(message);
        this.name = "OAuthInteractionInvalidError";
    }
}

export { ParametersMissingError, OAuthClientNotFoundError, OAuthInteractionInvalidError };