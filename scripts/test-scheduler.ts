// Smoke-Test der Planungs-Engine gegen die Seed-Daten.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateSchedule } from "../src/lib/scheduler";
import { datesOfYear, weekday } from "../src/lib/dates";

try { process.loadEnvFile(); } catch {}
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const year = new Date().getFullYear();
  // Rufdienst-Eignung aus Fähigkeiten: RUF_HG => Kat.1-Logik, nur RUF_VG => Kat.2-Logik
  const allOAs = await prisma.user.findMany({
    where: { active: true, jobRole: "OBERARZT" },
    select: { id: true, name: true, skills: { select: { skill: true, validFrom: true, validTo: true } } },
  });
  const overlaps = (s: { validFrom: string | null; validTo: string | null }) =>
    (!s.validFrom || s.validFrom <= `${year}-12-31`) && (!s.validTo || s.validTo >= `${year}-01-01`);
  const users: { id: string; name: string; category: number }[] = [];
  const excluded: string[] = [];
  for (const u of allOAs) {
    const has = (c: string) => u.skills.some((s) => s.skill === c && overlaps(s));
    if (has("RUF_HG")) users.push({ id: u.id, name: u.name, category: 1 });
    else if (has("RUF_VG")) users.push({ id: u.id, name: u.name, category: 2 });
    else excluded.push(u.name);
  }
  if (excluded.length) console.log("Ohne Ruf-Fähigkeit (nicht eingeplant):", excluded.join(", "));
  const holidays = await prisma.holiday.findMany({ where: { year } });

  const { assignments, report } = generateSchedule({
    year,
    users,
    holidays: new Set(holidays.map((h) => h.date)),
    absences: new Map(),
    wishes: new Map(),
    maxWeekendsPerMonth: 2,
  });

  // Deckungsprüfung: jeder Tag muss mind. einen VG haben; Wochenende/Feiertag auch HK.
  const holidaySet = new Set(holidays.map((h) => h.date));
  const vg = new Set<string>();
  const hk = new Set<string>();
  for (const a of assignments) {
    if (a.slot === "WEEKDAY" || a.slot === "VG") vg.add(a.date);
    if (a.slot === "WEEKDAY" || a.slot === "HK") hk.add(a.date);
  }
  let missingVg = 0, missingHk = 0;
  for (const d of datesOfYear(year)) {
    const w = weekday(d);
    const special = w === 0 || w === 5 || w === 6 || holidaySet.has(d);
    if (!vg.has(d)) missingVg++;
    if (special && !hk.has(d)) missingHk++;
  }

  const cat1 = report.distribution.filter((d) => d.category === 1);
  const cat2 = report.distribution.filter((d) => d.category === 2);
  const span = (xs: number[]) => (xs.length ? `${Math.min(...xs)}–${Math.max(...xs)}` : "-");

  console.log(`Users: ${users.length} (Kat1 ${cat1.length}, Kat2 ${cat2.length}), Feiertage ${holidays.length}`);
  console.log(`Zuweisungen gesamt: ${assignments.length}`);
  console.log(`Fehlende VG-Tage: ${missingVg}, fehlende HK-Tage: ${missingHk}`);
  console.log(`Unbesetzt laut Report: ${report.uncovered.length}`);
  console.log(`Kat1 Werktage Spanne: ${span(cat1.map((d) => d.weekdayCount))}`);
  console.log(`Kat1 Wochenende Spanne: ${span(cat1.map((d) => d.weekendUnits))}`);
  console.log(`Kat2 Wochenende Spanne: ${span(cat2.map((d) => d.weekendUnits))}`);
  console.log("Verteilung (Name | Kat | Werktag | WE | HK | VG):");
  for (const d of report.distribution) {
    console.log(`  ${d.name.padEnd(20)} ${d.category}  wt=${d.weekdayCount}  we=${d.weekendUnits}  hk=${d.hkCount}  vg=${d.vgCount}`);
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
