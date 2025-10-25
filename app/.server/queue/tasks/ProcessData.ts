export interface AppEventMap {
    "uesr.updated": { userId: string, changes: Record<string, any> };
    "user.deleted": { userId: string };
    "email.sent": { to: string, subject: string, body: string };
    unknown: unknown;
}

export interface AppQueueEvent<K extends keyof AppEventMap = keyof AppEventMap> {
    type: K;
    payload: AppEventMap[K];
    timestamp: number;
}