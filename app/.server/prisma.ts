import { PrismaClient } from "./generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in environment variables");
}

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });
export default prisma;