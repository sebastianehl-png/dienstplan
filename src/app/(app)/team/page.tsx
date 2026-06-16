import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { weekday } from "@/lib/dates";

const PLAN_YEAR = new Date().getFullYear();
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const pad = (n: number) => String(n).padStart(2, "0");

export default async function TeamPage() {
  await requireUser();
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const maxConcurrent = settings?.maxConcurrentAbsent ?? 5;

  const absences = await prisma.absence.findMany({
    where: { date: { startsWith: String(PLAN_YEAR) } },
    select: { date: true, type: true, status: true, user: { select: { name: true } } },
  });

  // date -> Liste der Abwesenden (mit Typ + Status)
  const byDay = new Map<string, { name: string; type: string; status: string }[]>();
  for (const a of absences) {
    const list = byDay.get(a.date) ?? [];
    list.push({ name: a.user.name, type: a.type, status: a.status });
    byDay.set(a.date, list);
  }
  // Zähler nur für freigegebenen regulären Urlaub (zählt fürs FCFS-Limit)
  const vacCount = (date: string) => (byDay.get(date) ?? []).filter((e) => e.type === "VACATION" && e.status === "APPROVED").length;
  const tooltip = (date: string) =>
    (byDay.get(date) ?? [])
      .map((e) => `${e.name}${e.type === "SPECIAL" ? " (Sonderurlaub)" : ""}${e.status !== "APPROVED" ? " – ausstehend" : ""}`)
      .join(", ");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Team-Abwesenheiten {PLAN_YEAR}</h1>
        <p className="text-zinc-500">Zahl = Kolleg:innen im Urlaub. Rot = Maximum ({maxConcurrent}) erreicht.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MONTHS.map((name, mIdx) => {
          const daysInMonth = new Date(Date.UTC(PLAN_YEAR, mIdx + 1, 0)).getUTCDate();
          const lead = (new Date(Date.UTC(PLAN_YEAR, mIdx, 1)).getUTCDay() + 6) % 7;
          const cells: (string | null)[] = [];
          for (let i = 0; i < lead; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(`${PLAN_YEAR}-${pad(mIdx + 1)}-${pad(d)}`);

          return (
            <div key={mIdx} className="rounded-xl border border-zinc-200 bg-white p-3">
              <div className="mb-2 text-sm font-medium text-zinc-800">{name}</div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-400">
                {WD.map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {cells.map((date, i) => {
                  if (!date) return <div key={i} />;
                  const day = Number(date.slice(8));
                  const w = weekday(date);
                  const isWeekend = w === 0 || w === 6;
                  const c = vacCount(date);
                  let cls = isWeekend ? "bg-zinc-100 text-zinc-400" : "bg-white text-zinc-600";
                  if (c > 0 && c < maxConcurrent) cls = "bg-amber-100 text-amber-800";
                  if (c >= maxConcurrent) cls = "bg-red-500 text-white";
                  return (
                    <div key={i} title={tooltip(date) || date} className={`flex aspect-square flex-col items-center justify-center rounded text-xs ${cls}`}>
                      <span>{day}</span>
                      {c > 0 && <span className="text-[9px] leading-none opacity-80">{c}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
