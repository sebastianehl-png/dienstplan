import Link from "next/link";
import { requireUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDays, formatDE, weekday } from "@/lib/dates";
import { WEEK_ROWS, DAY_NAMES } from "@/lib/weekplan-def";
import { weekLabel } from "@/lib/weekplan";

function defaultMonday(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const wd = d.getUTCDay();
  const diff = wd === 1 ? 0 : wd === 0 ? 1 : 8 - wd;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default async function WeekplanViewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const me = await requireUser();
  const staff = isStaff(me.role);
  const sp = await searchParams;
  let week = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : defaultMonday();
  if (weekday(week) !== 1) week = defaultMonday();

  const plan = await prisma.weekPlan.findUnique({ where: { weekStart: week }, include: { cells: true } });
  const visible = plan && (plan.status === "PUBLISHED" || staff);

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const lastName = (full: string) => full.trim().split(/\s+/).pop() ?? full;
  const cellMap = new Map((plan?.cells ?? []).map((c) => [`${c.rowKey}|${c.day}`, c]));
  const dates = [0, 1, 2, 3, 4].map((i) => addDays(week, i));

  const prev = addDays(week, -7);
  const next = addDays(week, 7);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Wochenplan</h1>
        <div className="flex items-center gap-1">
          <Link href={`/weekplan?week=${prev}`} className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50">←</Link>
          <span className="min-w-44 text-center text-sm font-medium">{weekLabel(week)}</span>
          <Link href={`/weekplan?week=${next}`} className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50">→</Link>
        </div>
        {visible && (
          <a href={`/api/weekplan/${week}/docx`} className="ml-auto rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">
            Word herunterladen
          </a>
        )}
      </div>

      {!visible ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-500">
          Für diese Woche ist noch kein Wochenplan veröffentlicht.
        </div>
      ) : (
        <>
          {plan!.status !== "PUBLISHED" && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Entwurf – nur für Sub-Admins sichtbar.</div>
          )}
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50 text-left text-zinc-600">
                  <th className="border-b border-zinc-200 px-3 py-2"></th>
                  {DAY_NAMES.map((d, i) => (
                    <th key={d} className="border-b border-l border-zinc-200 px-2 py-2">
                      {d} <span className="font-normal text-zinc-400">{formatDE(dates[i]).slice(0, 6)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WEEK_ROWS.map((row) => (
                  <tr key={row.key}>
                    <td className="max-w-44 border-t border-zinc-100 px-3 py-1.5 font-medium text-zinc-800">{row.label}</td>
                    {[0, 1, 2, 3, 4].map((day) => {
                      if (row.grayDays.includes(day)) return <td key={day} className="border-t border-l border-zinc-100 bg-zinc-200/70" />;
                      const c = cellMap.get(`${row.key}|${day}`);
                      const text = c?.text ?? (c?.userId ? lastName(nameOf.get(c.userId) ?? "") : "");
                      const mine = c?.userId === me.id;
                      return (
                        <td key={day} className={`border-t border-l border-zinc-100 px-2 py-1.5 ${mine ? "bg-blue-50 font-medium text-blue-900" : "text-zinc-700"}`}>
                          {text || "–"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-400">Deine Einsätze sind blau markiert.</p>
        </>
      )}
    </div>
  );
}
