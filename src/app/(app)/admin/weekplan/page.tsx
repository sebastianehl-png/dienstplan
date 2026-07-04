import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDays, formatDE, weekday } from "@/lib/dates";
import { skillValidOn } from "@/lib/skills";
import { WEEK_ROWS } from "@/lib/weekplan-def";
import { weekLabel } from "@/lib/weekplan";
import WeekGrid, { type GridData } from "./WeekGrid";

// Nächster Montag (bzw. heutiger, wenn Montag)
function defaultMonday(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const wd = d.getUTCDay(); // 0=So
  const diff = wd === 1 ? 0 : wd === 0 ? 1 : 8 - wd;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default async function WeekplanAdminPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isStaff(me.role)) redirect("/dashboard");

  const sp = await searchParams;
  let week = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : defaultMonday();
  if (weekday(week) !== 1) week = defaultMonday();
  const dates = [0, 1, 2, 3, 4].map((i) => addDays(week, i));

  const [plan, users, absences, rules] = await Promise.all([
    prisma.weekPlan.findUnique({ where: { weekStart: week }, include: { cells: true } }),
    prisma.user.findMany({ where: { active: true, jobRole: "OBERARZT" }, select: { id: true, name: true, skills: true } }),
    prisma.absence.findMany({ where: { status: "APPROVED", date: { in: dates } }, select: { userId: true, date: true } }),
    prisma.specialRule.findMany(),
  ]);

  const absentOn = new Set(absences.map((a) => `${a.userId}|${dates.indexOf(a.date)}`));

  const ruleBlocks = (userId: string, rowKey: string, day: number): boolean =>
    rules.some((r) => {
      if (r.userId !== userId) return false;
      if (r.rowKey && r.rowKey !== rowKey) return false;
      if (r.weekday !== day) return false;
      const date = dates[day];
      if (r.validFrom && date < r.validFrom) return false;
      if (r.validTo && date > r.validTo) return false;
      if (r.interval === "BIWEEKLY" && r.refDate) {
        const weeks = Math.round((Date.parse(date + "T00:00:00Z") - Date.parse(r.refDate + "T00:00:00Z")) / (7 * 24 * 3600 * 1000));
        return ((weeks % 2) + 2) % 2 === 0;
      }
      return true;
    });

  const eligible: Record<string, string[]> = {};
  for (const row of WEEK_ROWS) {
    if (!row.skill && !row.fromYearPlan) continue;
    for (let day = 0; day < 5; day++) {
      if (row.grayDays.includes(day)) continue;
      const list = users
        .filter((u) => {
          if (absentOn.has(`${u.id}|${day}`)) return false;
          if (ruleBlocks(u.id, row.key, day)) return false;
          if (row.fromYearPlan) return true; // Rufbereitschaft: manuell jeder anwesende OA wählbar
          return u.skills.some((s) => s.skill === row.skill && skillValidOn(s, dates[day]));
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((u) => u.id);
      eligible[`${row.key}|${day}`] = list;
    }
  }

  const cells: GridData["cells"] = {};
  if (plan) for (const c of plan.cells) cells[`${c.rowKey}|${c.day}`] = { userId: c.userId, text: c.text };

  const data: GridData = {
    weekStart: week,
    status: !plan ? "NONE" : (plan.status as "DRAFT" | "PUBLISHED"),
    cells,
    eligible,
    users: Object.fromEntries(users.map((u) => [u.id, u.name])),
    dayDates: dates.map((d) => formatDE(d).slice(0, 6)),
  };

  const prev = addDays(week, -7);
  const next = addDays(week, 7);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Oberarzt-Wochenplan</h1>
        <div className="flex items-center gap-1">
          <Link href={`/admin/weekplan?week=${prev}`} className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50">←</Link>
          <span className="min-w-44 text-center text-sm font-medium">{weekLabel(week)}</span>
          <Link href={`/admin/weekplan?week=${next}`} className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50">→</Link>
        </div>
        <Link href="/admin/weekplan-settings" className="ml-auto text-sm text-blue-700 hover:underline">
          Standard-OAs & Regeln →
        </Link>
      </div>

      <WeekGrid data={data} />
    </div>
  );
}
