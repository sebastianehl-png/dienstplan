import path from "node:path";
import { defineConfig, env } from "prisma/config";

// .env laden (Prisma 7 lädt sie für die Config nicht automatisch).
try {
  process.loadEnvFile();
} catch {
  // .env optional – Variablen können auch direkt gesetzt sein
}

// Prisma 7: Verbindung/__Migrationen__ werden hier konfiguriert (nicht mehr im Schema).
// Zur Laufzeit verbindet der PrismaClient über einen Driver-Adapter (siehe src/lib/prisma.ts).
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { path: path.join("prisma", "migrations") },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
