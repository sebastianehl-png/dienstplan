// Legt die ECHTEN Standardnutzer an und entfernt alle Demo-Nutzer samt deren
// Einträgen/Plänen. Einstellungen, Feiertage und Abwesenheitsarten bleiben.
//
//   npm run seed:real
//
// Passwort für alle: SEED_PASSWORD aus .env

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

try {
  process.loadEnvFile();
} catch {}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");

// "Nachname, Vorname" → Anzeigename "Vorname Nachname"
const OBERAERZTE = [
  "Adam, Matti",
  "Frank, Konrad",
  "Halbach, Marcel",
  "Heyne, Sebastian",
  "Hohmann, Christopher",
  "Iliadis, Christos",
  "Körber, Maria",
  "Lakhal, Donia",
  "Lee, Samuel",
  "Lüker, Jakob",
  "Mauri, Victor",
  "Mehrkens, Dennis",
  "Nettersheim, Felix",
  "Pfister, Roman",
  "Rosenkranz, Stephan",
  "Seuthe, Katharina",
  "Ten Freyhaus, Henrik",
  "Terporten, Johannes",
  "Van den Bruck, Jan-Hendrik",
  "Wienemann, Hendrik",
  "Wörmann, Jonas",
];

const SUBADMIN_NAMES = new Set(["Lee, Samuel"]);

async function main() {
  const seedPassword = process.env.SEED_PASSWORD || "passwort";
  const pw = await bcrypt.hash(seedPassword, 10);

  // ---- Alte Nutzer + abhängige Daten entfernen ----
  await prisma.weekPlan.deleteMany({}); // cascades WeekCell
  await prisma.plan.deleteMany({}); // cascades Assignment
  await prisma.leaveLog.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.rowDefault.deleteMany({});
  await prisma.specialRule.deleteMany({});
  await prisma.user.deleteMany({}); // cascades Absence/Wish/UserSkill/UserGroup/Carryover/Token

  // ---- Verwaltung ----
  await prisma.user.create({
    data: { email: "admin@klinik.de", passwordHash: pw, name: "Hauptadmin", category: 1, role: "ADMIN", jobRole: "VERWALTUNG" },
  });
  for (const name of ["Lisa Hamels", "Irina Schmitz"]) {
    await prisma.user.create({
      data: { email: `${slug(name)}@klinik.de`, passwordHash: pw, name, category: 1, role: "SUBADMIN", jobRole: "VERWALTUNG", position: "Sekretariat" },
    });
  }

  // ---- Oberärzte ----
  for (const entry of OBERAERZTE) {
    const [last, first] = entry.split(",").map((s) => s.trim());
    const name = `${first} ${last}`;
    await prisma.user.create({
      data: {
        email: `${slug(name)}@klinik.de`,
        passwordHash: pw,
        name,
        category: 1, // Dienstplan-Kategorie: bitte je Person prüfen/anpassen!
        role: SUBADMIN_NAMES.has(entry) ? "SUBADMIN" : "DOCTOR",
        jobRole: "OBERARZT",
      },
    });
  }

  // ---- Beispiel laut Anforderung: Heyne als Standard-OA für ITS + ITS-Konsil ----
  const heyne = await prisma.user.findUnique({ where: { email: "sebastian.heyne@klinik.de" } });
  if (heyne) {
    await prisma.userSkill.createMany({
      data: [
        { userId: heyne.id, skill: "ITS" },
        { userId: heyne.id, skill: "ITS_KONSIL" },
      ],
    });
    for (const rowKey of ["ITS", "ITS_KONSIL"]) {
      await prisma.rowDefault.upsert({
        where: { rowKey_slot: { rowKey, slot: 0 } },
        update: { userId: heyne.id },
        create: { rowKey, slot: 0, userId: heyne.id },
      });
    }
  }

  const n = await prisma.user.count();
  console.log(`Fertig: ${n} Nutzer angelegt (Passwort für alle: ${seedPassword}).`);
  console.log("  Hauptadmin:  admin@klinik.de (Admin)");
  console.log("  Sub-Admins:  lisa.hamels@klinik.de, irina.schmitz@klinik.de, samuel.lee@klinik.de");
  console.log("  Oberärzte:   z.B. sebastian.heyne@klinik.de, maria.koerber@klinik.de …");
  console.log("Hinweise: Dienstplan-Kategorie steht überall auf 1 und Fähigkeiten sind (außer Heyne) leer –");
  console.log("beides unter Personal bzw. Nutzer pflegen. Heyne ist Standard-OA für ITS und ITS-Konsil.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
