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
    if (redisScopes) {
        try {
            return JSON.parse(redisScopes);
        } catch {
            await invalidateScopeCache();
        }
    }

    const scopes = await prisma.oidcScope.findMany({
        select: { id: true, name: true, description: true },
    });

    const scopesMap: Scopes = Object.fromEntries(
        scopes.map((scope) => [scope.id, scope])
    );

    await client.set(KEY, JSON.stringify(scopesMap), "EX", 3600);
    return scopesMap;
}

interface ValidateScopeResult {
    validScopes: ScopeRecord[];
    invalidScopes?: string[];
}

export async function validateScope(
    scopes: string[]
): Promise<ValidateScopeResult> {
    const availableScopes = await serverScopes();
    const validScopes = scopes
        .map((scope) => availableScopes[scope])
        .filter(Boolean) as ScopeRecord[];
    
    const invalidScopes = scopes.filter((s) => !availableScopes[s]);
    return {
        validScopes,
        invalidScopes: invalidScopes.length ? invalidScopes : undefined,
    };
}

export async function invalidateScopeCache() {
    await client.del(KEY);
}
