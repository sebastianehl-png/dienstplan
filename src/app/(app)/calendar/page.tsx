import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getVacationLimit } from "@/lib/actions";
import CalendarEditor from "./CalendarEditor";

const PLAN_YEAR = new Date().getFullYear();

export default async function CalendarPage() {
  const user = await requireUser();

  const [absences, wishes, holidays, vacationLimit] = await Promise.all([
    prisma.absence.findMany({ where: { userId: user.id, date: { startsWith: String(PLAN_YEAR) } }, select: { date: true, type: true, status: true } }),
    prisma.wish.findMany({ where: { userId: user.id, date: { startsWith: String(PLAN_YEAR) } }, select: { date: true, status: true } }),
    prisma.holiday.findMany({ where: { year: PLAN_YEAR }, select: { date: true, name: true } }),
    getVacationLimit(user.id, PLAN_YEAR),
  ]);

  const entries: Record<string, { type: "VACATION" | "SPECIAL" | "WISH"; status: string }> = {};
  for (const a of absences) entries[a.date] = { type: a.type as "VACATION" | "SPECIAL", status: a.status };
  for (const w of wishes) entries[w.date] = { type: "WISH", status: w.status };
  const holidayMap: Record<string, string> = {};
  for (const h of holidays) holidayMap[h.date] = h.name;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Mein Kalender {PLAN_YEAR}</h1>
        <p className="text-zinc-500">
          Urlaub, Sonderurlaub und Freiwünsche eintragen. Neue Einträge sind <strong>ausstehend</strong>, bis ein Sub-Admin sie freigibt.
        </p>
      </div>
      <CalendarEditor year={PLAN_YEAR} initialEntries={entries} holidays={holidayMap} vacationLimit={vacationLimit} />
    </div>
  );
}
