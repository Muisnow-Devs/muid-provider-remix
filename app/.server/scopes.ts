import prisma from "./prisma";
import client from "./redis";

interface ScopeRecord {
    id: string;
    name: string;
    description: string | null;
}

interface Scopes {
    [key: string]: ScopeRecord;
}

export async function serverScopes(): Promise<Scopes> {
    const redisScopes = await client.get("muid:server:scopes");
    if (redisScopes) return JSON.parse(redisScopes);

    const scopes = await prisma.oidcScope.findMany({
        select: { id: true, name: true, description: true },
    });
    await client.set("muid:server:scopes", JSON.stringify(scopes), "EX", 3600);

    const scopesMap: Scopes = {};
    scopes.forEach((scope) => {
        scopesMap[scope.id] = scope;
    });

    return scopesMap;
}

interface ValidateScopeResult {
    validScopes: ScopeRecord[];
    invalidScopes?: string[];
}

export async function vailidateScope(
    scopes: string[]
): Promise<ValidateScopeResult> {
    const availableScopes = await serverScopes();

    const validScopes: ScopeRecord[] = [];
    const invalidScopes: string[] = [];
    for (const scope of scopes) {
        const record = availableScopes[scope];

        if (record) {
            validScopes.push(record);
            continue;
        }
        invalidScopes.push(scope);
    }

    return {
        validScopes,
        invalidScopes: invalidScopes.length ? invalidScopes : undefined,
    };
}
