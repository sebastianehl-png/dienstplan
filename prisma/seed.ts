import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import Holidays from "date-holidays";

try {
  process.loadEnvFile();
} catch {
  // .env optional – Variablen können auch direkt gesetzt sein
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function main() {
  // Test-Passwort über Umgebungsvariable (Default für Demo). Für eine öffentliche
  // Testinstanz in SEED_PASSWORD etwas Eigenes setzen.
  const seedPassword = process.env.SEED_PASSWORD || "passwort";
  const pw = await bcrypt.hash(seedPassword, 10);

  // Beispiel-Oberärzte: Mischung aus Kategorie 1 und 2.
  const cat1Names = [
    "Anna Bauer", "Bernd Christ", "Clara Dietrich", "David Engel", "Eva Fischer",
    "Felix Groß", "Greta Huber", "Hannes Iversen", "Ina Jung", "Jonas Klein",
    "Karla Lang", "Lukas Mayer",
  ];
  const cat2Names = [
    "Mara Neumann", "Nico Otto", "Paula Peters", "Quirin Richter",
    "Rosa Schmidt", "Tom Ulrich", "Uwe Voss", "Vera Wagner",
  ];

  const slug = (name: string) =>
    name.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/ /g, ".");

  // Admin (gleichzeitig Kat.-1-Oberarzt)
  await prisma.user.upsert({
    where: { email: "admin@klinik.de" },
    update: {},
    create: { email: "admin@klinik.de", passwordHash: pw, name: "Admin (Chefarzt)", category: 1, role: "ADMIN" },
  });

  for (const name of cat1Names) {
    const email = `${slug(name)}@klinik.de`;
    await prisma.user.upsert({ where: { email }, update: {}, create: { email, passwordHash: pw, name, category: 1 } });
  }
  for (const name of cat2Names) {
    const email = `${slug(name)}@klinik.de`;
    await prisma.user.upsert({ where: { email }, update: {}, create: { email, passwordHash: pw, name, category: 2 } });
  }

  // Einstellungen (Single-Row)
  await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, maxConcurrentAbsent: 5, vacationDaysPerYear: 30, maxWeekendsPerMonth: 2 },
  });

  // Abwesenheitsarten (Timebutler-Stil): eingebaute + Beispiele
  const typeDefs = [
    { code: "VACATION", name: "Urlaub", short: "U", color: "#eab308", countsAsVacation: true, countsForLimit: true, needsApproval: true, builtin: true, sortOrder: 1 },
    { code: "SPECIAL", name: "Sonderurlaub", short: "SU", color: "#3b82f6", countsAsVacation: false, countsForLimit: false, needsApproval: true, builtin: true, sortOrder: 2 },
    { code: "SICK", name: "Krankheit", short: "K", color: "#f97316", countsAsVacation: false, countsForLimit: false, needsApproval: false, builtin: true, sortOrder: 3 },
    { code: "TRAINING", name: "Fortbildung", short: "FB", color: "#8b5cf6", countsAsVacation: false, countsForLimit: false, needsApproval: true, builtin: false, sortOrder: 10 },
    { code: "BUSINESS_TRIP", name: "Dienstreise", short: "DR", color: "#10b981", countsAsVacation: false, countsForLimit: false, needsApproval: true, builtin: false, sortOrder: 11 },
  ];
  for (const t of typeDefs) {
    await prisma.absenceType.upsert({ where: { code: t.code }, update: {}, create: { ...t, active: true } });
  }

  // NRW-Feiertage für aktuelles + nächstes Jahr
  const thisYear = new Date().getUTCFullYear();
  for (const year of [thisYear, thisYear + 1]) {
    const hd = new Holidays("DE", "NW");
    for (const h of hd.getHolidays(year)) {
      if (h.type !== "public") continue;
      const date = iso(new Date(h.date.slice(0, 10) + "T00:00:00Z"));
      await prisma.holiday.upsert({
        where: { date },
        update: { name: h.name, year },
        create: { date, name: h.name, year },
      });
    }
  }

  // --- Demo: Sub-Admin, Gruppen, Beispiel-Einträge ---
  await prisma.user.update({ where: { email: "bernd.christ@klinik.de" }, data: { role: "SUBADMIN" } }).catch(() => {});

  const groupNames = ["Sektion A", "Sektion B"];
  const groupIds: Record<string, string> = {};
  for (const name of groupNames) {
    const g = await prisma.group.upsert({ where: { name }, update: {}, create: { name } });
    groupIds[name] = g.id;
  }
  const assign = async (email: string, group: string) => {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) await prisma.userGroup.upsert({ where: { userId_groupId: { userId: u.id, groupId: groupIds[group] } }, update: {}, create: { userId: u.id, groupId: groupIds[group] } });
  };
  await assign("anna.bauer@klinik.de", "Sektion A");
  await assign("clara.dietrich@klinik.de", "Sektion A");
  await assign("mara.neumann@klinik.de", "Sektion A");
  await assign("david.engel@klinik.de", "Sektion B");
  await assign("nico.otto@klinik.de", "Sektion B");

  // Saubere Demo-Antragsdaten neu aufsetzen
  await prisma.leaveLog.deleteMany({});
  await prisma.comment.deleteMany({});

  const datesBetween = (start: string, end: string) => {
    const out: string[] = [];
    const d = new Date(start + "T00:00:00Z");
    const e = new Date(end + "T00:00:00Z");
    while (d <= e) { out.push(iso(d)); d.setUTCDate(d.getUTCDate() + 1); }
    return out;
  };
  const addLeave = async (email: string, start: string, end: string, type: string, status: string) => {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) return;
    const groupId = `seed_${u.id}_${start}`;
    const approvedAt = status === "APPROVED" ? new Date() : null;
    for (const date of datesBetween(start, end)) {
      await prisma.absence.upsert({
        where: { userId_date: { userId: u.id, date } },
        update: { type, status, groupId, approvedAt },
        create: { userId: u.id, date, type, status, groupId, approvedAt },
      });
    }
    const range = `${start}–${end} ${type}`;
    await prisma.leaveLog.create({ data: { groupId, action: "CREATED", byUserId: u.id, detail: range } });
    if (status === "APPROVED") await prisma.leaveLog.create({ data: { groupId, action: "APPROVED", detail: range } });
  };
  // zusammenhängende Beispiel-Anträge (freigegeben + ausstehend)
  await addLeave("anna.bauer@klinik.de", `${thisYear}-07-06`, `${thisYear}-07-10`, "VACATION", "APPROVED");
  await addLeave("clara.dietrich@klinik.de", `${thisYear}-07-06`, `${thisYear}-07-08`, "VACATION", "PENDING");
  await addLeave("david.engel@klinik.de", `${thisYear}-08-10`, `${thisYear}-08-14`, "SPECIAL", "APPROVED");
  await addLeave("mara.neumann@klinik.de", `${thisYear}-07-13`, `${thisYear}-07-17`, "VACATION", "PENDING");

  // Demo: eine Krankmeldung (sofort wirksam) und Beispiel-Stammdaten
  await addLeave("greta.huber@klinik.de", `${thisYear}-06-22`, `${thisYear}-06-24`, "SICK", "APPROVED");
  await prisma.user.update({
    where: { email: "anna.bauer@klinik.de" },
    data: { position: "Oberärztin Kardiologie", weeklyHours: 40, hireDate: "2019-04-01", phone: "+49 221 555-1234" },
  }).catch(() => {});
  await prisma.user.update({
    where: { email: "mara.neumann@klinik.de" },
    data: { position: "Oberärztin Gastroenterologie", weeklyHours: 32, hireDate: "2022-09-15" },
  }).catch(() => {});

  // Demo-Freiwunsch (zeigt das FW-Kürzel in der Urlaubsübersicht)
  const felix = await prisma.user.findUnique({ where: { email: "felix.gross@klinik.de" } });
  if (felix) {
    const wishGroup = `seed_wish_${felix.id}`;
    for (const date of datesBetween(`${thisYear}-07-15`, `${thisYear}-07-16`)) {
      await prisma.wish.upsert({
        where: { userId_date: { userId: felix.id, date } },
        update: { status: "PENDING", groupId: wishGroup },
        create: { userId: felix.id, date, status: "PENDING", groupId: wishGroup },
      });
    }
    await prisma.leaveLog.create({ data: { groupId: wishGroup, action: "CREATED", byUserId: felix.id, detail: `${thisYear}-07-15–${thisYear}-07-16 Freiwunsch` } });
  }

  // Backfill: evtl. vorhandene Alt-Einträge ohne groupId bekommen einen Antrag + Protokoll
  for (const a of await prisma.absence.findMany({ where: { groupId: "" } })) {
    await prisma.absence.update({ where: { id: a.id }, data: { groupId: a.id } });
    await prisma.leaveLog.create({ data: { groupId: a.id, action: "CREATED", byUserId: a.userId, detail: `${a.date} ${a.type}` } });
  }
  for (const w of await prisma.wish.findMany({ where: { groupId: "" } })) {
    await prisma.wish.update({ where: { id: w.id }, data: { groupId: w.id } });
  }

  const count = await prisma.user.count();
  console.log(`Seed fertig: ${count} Nutzer, Feiertage ${thisYear}/${thisYear + 1}.`);
  console.log(`Login Admin:     admin@klinik.de / ${seedPassword}`);
  console.log(`Login Sub-Admin: bernd.christ@klinik.de / ${seedPassword}`);
  console.log(`Login Arzt:      anna.bauer@klinik.de / ${seedPassword} (u.a.)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
