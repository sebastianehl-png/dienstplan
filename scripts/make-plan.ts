// Erzeugt & speichert einen vorläufigen Plan (wie der Admin-Button), für Demo/Test.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateSchedule } from "../src/lib/scheduler";

try { process.loadEnvFile(); } catch {}
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const year = new Date().getFullYear();
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, category: true } });
  const holidays = await prisma.holiday.findMany({ where: { year } });
  const absRows = await prisma.absence.findMany({ where: { date: { startsWith: String(year) } } });
  const wishRows = await prisma.wish.findMany({ where: { date: { startsWith: String(year) } } });

  const absences = new Map<string, Set<string>>();
  for (const a of absRows) (absences.get(a.date) ?? absences.set(a.date, new Set()).get(a.date)!).add(a.userId);
  const wishes = new Map<string, Set<string>>();
  for (const w of wishRows) (wishes.get(w.date) ?? wishes.set(w.date, new Set()).get(w.date)!).add(w.userId);

  const { assignments, report } = generateSchedule({
    year, users, holidays: new Set(holidays.map((h) => h.date)), absences, wishes, maxWeekendsPerMonth: 2,
  });

  await prisma.plan.deleteMany({ where: { year } });
  const plan = await prisma.plan.create({ data: { year, status: "DRAFT", reportJson: JSON.stringify(report) } });
  await prisma.assignment.createMany({ data: assignments.map((a) => ({ planId: plan.id, date: a.date, slot: a.slot, userId: a.userId })) });
  console.log(`Plan ${year} gespeichert: ${assignments.length} Zuweisungen, ${report.uncovered.length} unbesetzt.`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
