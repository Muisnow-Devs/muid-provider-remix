import { PubSub } from "@google-cloud/pubsub";

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS must be set in environment variables"
    );
}

export enum PubSubTopics {
    IDENTITY_EVENTS = "identity-events",
}

const client = new PubSub();
export enum EventType {
    USER_PROFILE_UPDATED = "USER_PROFILE_UPDATED",
    ACCOUNT_STATUS_CHANGED = "ACCOUNT_STATUS_CHANGED",
    ACCESS_REVOKED = "ACCESS_REVOKED",
}

export interface PubSubMessage {
    eventId: string;
    timestamp: number;
    userId: string;
    type: EventType;
    target: string | null;
    payload: string;
}

export interface IdentityEventPayloadMap {
    [EventType.USER_PROFILE_UPDATED]: Record<string, unknown>;
    [EventType.ACCOUNT_STATUS_CHANGED]: {
        status: "active" | "suspended" | "deactivated";
    };
    [EventType.ACCESS_REVOKED]: Record<string, never>;
}

export function sendTopicMessage(
    topicName: PubSubTopics,
    attributes: Record<string, string>,
    payload: object,
    orderedKey?: string
): Promise<string> {
    return client.topic(topicName).publishMessage({
        attributes,
        data: Buffer.from(JSON.stringify(payload)),
        orderingKey: orderedKey,
    });
}

export function sendIdentityEvent<T extends EventType>(
    eventType: T,
    userId: string,
    payload: IdentityEventPayloadMap[T],
    target: string | null = null
) {
    const message: PubSubMessage = {
        eventId: crypto.randomUUID(),
        timestamp: Math.floor(Date.now() / 1000),
        userId,
        target,
        type: eventType,
        payload: JSON.stringify(payload),
    };

    const { payload: _, ...attributes } = message;

    return sendTopicMessage(
        PubSubTopics.IDENTITY_EVENTS,
        Object.fromEntries(
            Object.entries(attributes).map(([key, value]) => [
                key,
                String(value),
            ])
        ),
        message,
        userId
    );
}
