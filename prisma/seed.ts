import { OidcScope } from "@/.server/generated/prisma/client";
import db from "../app/.server/prisma";

function generateOidcScope(id: string, name: string, description: string): OidcScope {
    return {
        id,
        name,
        description,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
}

async function insertOIDCScopes() {
    const scopes: OidcScope[] = [
        generateOidcScope("openid", "MuID Identity", "Your identity in MuID"),
        generateOidcScope("profile", "MuID Profile", "Your MuID profiles"),
        generateOidcScope("email", "MuID Email", "Your Email in MuID"),
        generateOidcScope(
            "offline_access",
            "OAuth offline access",
            "Allow application to access your data anytime"
        ),
        generateOidcScope(
            "dalist:schedule.read",
            "Read Dalist schedules",
            "Allow application to read your schedules in Dalist"
        ),
        generateOidcScope(
            "dalist:schedule.write",
            "Write Dalist schedules",
            "Allow application to write new schedules into your Dalist schedules"
        ),
        generateOidcScope(
            "wallefy:record.read",
            "Read Wallefy records",
            "Allow application to read your Wallefy records"
        ),
        generateOidcScope(
            "wallefy:record.write",
            "Write Wallefy records",
            "Allow application to write new record into your Wallefy"
        ),
    ];

    for (const scope of scopes) {
        await db.oidcScope.upsert({
            where: { name: scope.name },
            update: { description: scope.description },
            create: scope,
        });
    }
}

async function main() {
    console.log("Seeding OIDC scopes...");
    await insertOIDCScopes();
    console.log("Seeding completed.");
}

main()
    .then(async () => {
        await db.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await db.$disconnect();
        process.exit(1);
    });
