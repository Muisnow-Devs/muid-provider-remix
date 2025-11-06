import prisma from "../prisma";
import client from "../redis";

const KEY = "muid:server:scopes";

interface ScopeRecord {
    id: string;
    name: string;
    description: string | null;
}

interface Scopes {
    [key: string]: ScopeRecord;
}

export async function serverScopes(): Promise<Scopes> {
    const redisScopes = await client.get(KEY);
    if (redisScopes) return JSON.parse(redisScopes);

    const scopes = await prisma.oidcScope.findMany({
        select: { id: true, name: true, description: true },
    });

    const scopesMap: Scopes = {};
    scopes.forEach((scope) => {
        scopesMap[scope.id] = scope;
    });

    await client.set(KEY, JSON.stringify(scopesMap), "EX", 3600);
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

export async function invalidateScopeCache() {
    await client.del(KEY);
}