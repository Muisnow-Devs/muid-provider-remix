export enum QueueNames {
    DEFAULT = "default",
    CLIENT_EVENTS = "clientEvents",
}

interface WebhookUrlPayload {
    url: string;
    clientId: string;
}

export interface AppEventMap {
    "uesr.updated": {
        userId: string;
        changes: Record<string, any>;
        sending?: WebhookUrlPayload;
    };
    "user.deleted": {
        userId: string;
        clients: string[];
        sending?: WebhookUrlPayload;
    };
    "user.revoked": {
        userId: string;
        clientId: string;
        sending?: WebhookUrlPayload;
    };
    "email.sent": { to: string; subject: string; body: string };
    "webhook.sent": {
        userId: string;
        clientId: string;
        type: string;
        url: string;
        payload: any;
    };
    unknown: unknown;
}

export interface AppQueueEvent<
    K extends keyof AppEventMap = keyof AppEventMap,
> {
    type: K;
    payload: AppEventMap[K];
    timestamp: number;
}
