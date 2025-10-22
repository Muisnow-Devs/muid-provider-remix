class SessionNotFoundError extends Error {
    constructor(message = "Session not found") {
        super(message);
        this.name = "SessionNotFoundError";
    }
}

export { SessionNotFoundError };