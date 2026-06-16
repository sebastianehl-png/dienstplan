import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDE, weekday, weekdayName } from "@/lib/dates";

const PLAN_YEAR = new Date().getFullYear();
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export default async function PlanPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const plan = await prisma.plan.findUnique({ where: { year: PLAN_YEAR } });

  if (!plan) {
    return <Empty msg="Für dieses Jahr wurde noch kein Dienstplan erstellt." />;
  }
  if (plan.status !== "RELEASED" && !isAdmin) {
    return <Empty msg="Der Dienstplan ist noch in Bearbeitung und nicht freigegeben." />;
  }

  const [assignments, holidays, users] = await Promise.all([
    prisma.assignment.findMany({ where: { planId: plan.id }, select: { date: true, slot: true, userId: true } }),
    prisma.holiday.findMany({ where: { year: PLAN_YEAR }, select: { date: true } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const holidaySet = new Set(holidays.map((h) => h.date));

  // date -> { vg, hk, weekdayUser }
  type Day = { vg?: string; hk?: string; main?: string };
  const byDate = new Map<string, Day>();
  for (const a of assignments) {
    const d = byDate.get(a.date) ?? {};
    if (a.slot === "WEEKDAY") d.main = a.userId;
    else if (a.slot === "HK") d.hk = a.userId;
    else if (a.slot === "VG") d.vg = a.userId;
    byDate.set(a.date, d);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Dienstplan {PLAN_YEAR}</h1>
          <p className="text-zinc-500">
            {plan.status === "RELEASED" ? "Freigegeben ✓" : "Vorläufig (nur für Admin sichtbar)"} · Deine Dienste sind blau hervorgehoben.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {MONTHS.map((mName, mIdx) => {
          const days: string[] = [];
          const daysInMonth = new Date(Date.UTC(PLAN_YEAR, mIdx + 1, 0)).getUTCDate();
          for (let d = 1; d <= daysInMonth; d++) days.push(`${PLAN_YEAR}-${String(mIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

          return (
            <div key={mIdx} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-800">{mName}</div>
              <table className="w-full text-sm">
                <tbody>
                  {days.map((date) => {
                    const w = weekday(date);
                    const isHol = holidaySet.has(date);
                    const isSpecial = w === 0 || w === 5 || w === 6 || isHol; // Fr/Sa/So/Feiertag
                    const day = byDate.get(date) ?? {};
                    const vg = day.main ?? day.vg;
                    const hk = day.main ?? day.hk;
                    const mine = [day.main, day.vg, day.hk].includes(user.id);
                    return (
                      <tr key={date} className={`border-t border-zinc-50 ${mine ? "bg-blue-50" : isSpecial ? "bg-amber-50/40" : ""}`}>
                        <td className="w-24 px-3 py-1.5 align-top text-zinc-500">
                          <span className="font-mono text-xs">{weekdayName(date)}</span> {formatDE(date).slice(0, 6)}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="text-zinc-800">{vg ? nameOf.get(vg) : "—"}</span>
                          <span className="ml-1 text-xs text-zinc-400">VG</span>
                        </td>
                        <td className="px-3 py-1.5">
                          {day.main ? (
                            <span className="text-xs text-zinc-400">(inkl. HK)</span>
                          ) : (
                            <>
                              <span className="text-zinc-800">{hk ? nameOf.get(hk) : "—"}</span>
                              <span className="ml-1 text-xs text-zinc-400">HK</span>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Dienstplan {PLAN_YEAR}</h1>
      <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-500">{msg}</div>
    </div>
  );
}
