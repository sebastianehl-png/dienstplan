import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getVacationLimit } from "@/lib/actions";
import { getAbsenceTypes } from "@/lib/absence-types";
import CalendarEditor, { type CalendarType } from "./CalendarEditor";

const PLAN_YEAR = new Date().getFullYear();

export default async function CalendarPage() {
  const user = await requireUser();

  const [absences, wishes, holidays, vacationLimit, types, colleagues] = await Promise.all([
    prisma.absence.findMany({ where: { userId: user.id, date: { startsWith: String(PLAN_YEAR) } }, select: { date: true, type: true, status: true } }),
    prisma.wish.findMany({ where: { userId: user.id, date: { startsWith: String(PLAN_YEAR) } }, select: { date: true, status: true } }),
    prisma.holiday.findMany({ where: { year: PLAN_YEAR }, select: { date: true, name: true } }),
    getVacationLimit(user.id, PLAN_YEAR),
    getAbsenceTypes(),
    prisma.user.findMany({ where: { active: true, id: { not: user.id } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const entries: Record<string, { type: string; status: string }> = {};
  for (const a of absences) entries[a.date] = { type: a.type, status: a.status };
  for (const w of wishes) entries[w.date] = { type: "WISH", status: w.status };
  const holidayMap: Record<string, string> = {};
  for (const h of holidays) holidayMap[h.date] = h.name;

  const calendarTypes: CalendarType[] = types.map((t) => ({
    code: t.code,
    name: t.name,
    short: t.short,
    color: t.color,
    countsAsVacation: t.countsAsVacation,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Mein Kalender {PLAN_YEAR}</h1>
        <p className="text-zinc-500">
          Abwesenheiten und Freiwünsche eintragen. Anträge sind <strong>ausstehend</strong>, bis ein Sub-Admin sie freigibt –
          Arten ohne Genehmigungspflicht (z.B. Krankheit) gelten sofort.
        </p>
      </div>
      <CalendarEditor
        year={PLAN_YEAR}
        initialEntries={entries}
        holidays={holidayMap}
        vacationLimit={vacationLimit}
        types={calendarTypes}
        colleagues={colleagues}
      />
    </div>
  );
}
