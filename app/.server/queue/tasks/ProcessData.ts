export enum QueueNames {
    DEFAULT = "default",
    CLIENT_EVENTS = "clientEvents",
}

export interface AppEventMap {
    "user.updated": {
        userId: string;
        changes: Record<string, any>;
    };
    "user.deleted": {
        userId: string;
        clients: string[];
    };
    "user.revoked": {
        userId: string;
        clientId: string;
    };
    "email.sent": { to: string; subject: string; body: string };
    unknown: unknown;
}

export interface AppQueueEvent<
    K extends keyof AppEventMap = keyof AppEventMap,
> {
    type: K;
    payload: AppEventMap[K];
    timestamp: number;
}
