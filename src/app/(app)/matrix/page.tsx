import Link from "next/link";
import { requireUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequests } from "@/lib/requests";
import { getAbsenceTypes } from "@/lib/absence-types";
import MatrixGrid, { type Cell, type LegendItem, type ReqDetail } from "./MatrixGrid";

const PLAN_YEAR = new Date().getFullYear();
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const pad = (n: number) => String(n).padStart(2, "0");

export default async function MatrixPage({ searchParams }: { searchParams: Promise<{ month?: string; group?: string }> }) {
  const me = await requireUser();
  const staff = isStaff(me.role);
  const sp = await searchParams;
  const month = Math.min(12, Math.max(1, Number(sp.month) || new Date().getMonth() + 1));
  const groupId = sp.group || "";

  const groups = await prisma.group.findMany({ orderBy: { name: "asc" } });
  const users = await prisma.user.findMany({
    where: { active: true, ...(groupId ? { groups: { some: { groupId } } } : {}) },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, name: true, category: true },
  });

  const monthPrefix = `${PLAN_YEAR}-${pad(month)}`;
  const [absences, wishes, holidays, types] = await Promise.all([
    prisma.absence.findMany({ where: { date: { startsWith: monthPrefix } }, select: { userId: true, date: true, type: true, status: true, groupId: true } }),
    prisma.wish.findMany({ where: { date: { startsWith: monthPrefix } }, select: { userId: true, date: true, status: true, groupId: true } }),
    prisma.holiday.findMany({ where: { date: { startsWith: monthPrefix } }, select: { date: true } }),
    getAbsenceTypes(true),
  ]);
  const typeByCode = new Map(types.map((t) => [t.code, t]));
  const WISH = { short: "FW", name: "Freiwunsch", color: "#06b6d4" };

  const cells: Record<string, Cell> = {};
  for (const a of absences) {
    const t = typeByCode.get(a.type);
    cells[`${a.userId}|${a.date}`] = {
      short: t?.short ?? "?",
      name: t?.name ?? a.type,
      color: t?.color ?? "#64748b",
      status: a.status,
      groupId: a.groupId,
    };
  }
  for (const w of wishes) {
    // Abwesenheiten haben Vorrang in der Anzeige
    const key = `${w.userId}|${w.date}`;
    if (!cells[key]) cells[key] = { short: WISH.short, name: WISH.name, color: WISH.color, status: w.status, groupId: w.groupId };
  }

  const legend: LegendItem[] = [
    ...types.filter((t) => t.active).map((t) => ({ short: t.short, name: t.name, color: t.color })),
    { short: WISH.short, name: WISH.name, color: WISH.color },
  ];

  // Detail-Daten: Sub-Admins sehen alle Anträge, andere nur ihre eigenen.
  const requests: Record<string, ReqDetail> = {};
  {
    const visibleGroups = new Set(Object.values(cells).map((c) => c.groupId));
    for (const r of await getRequests({ yearPrefix: String(PLAN_YEAR) })) {
      if (!visibleGroups.has(r.groupId)) continue;
      if (!staff && r.userId !== me.id) continue;
      requests[r.groupId] = {
        groupId: r.groupId,
        userName: r.userName,
        kindName: r.kindName,
        substituteName: r.substituteName,
        start: r.start,
        end: r.end,
        days: r.days,
        weekdays: r.weekdays,
        vacationCounting: r.vacationCounting,
        status: r.status,
        createdAt: r.createdAt,
        modifiedAt: r.modifiedAt,
        approvedAt: r.approvedAt,
        approvedByName: r.approvedByName,
        comments: r.comments,
      };
    }
  }

  const daysInMonth = new Date(Date.UTC(PLAN_YEAR, month, 0)).getUTCDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => `${monthPrefix}-${pad(i + 1)}`);
  const qp = (m: number, g: string) => `/matrix?month=${m}${g ? `&group=${g}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-zinc-900">Urlaubsübersicht {PLAN_YEAR}</h1>
        <div className="flex items-center gap-1">
          <Link href={qp(month === 1 ? 12 : month - 1, groupId)} className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50">←</Link>
          <span className="min-w-28 text-center text-sm font-medium">{MONTHS[month - 1]}</span>
          <Link href={qp(month === 12 ? 1 : month + 1, groupId)} className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50">→</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-sm">
        <span className="text-zinc-500">Gruppe:</span>
        <Link href={qp(month, "")} className={`rounded-md px-2 py-1 ${!groupId ? "bg-zinc-900 text-white" : "border border-zinc-300 hover:bg-zinc-50"}`}>Alle</Link>
        {groups.map((g) => (
          <Link key={g.id} href={qp(month, g.id)} className={`rounded-md px-2 py-1 ${groupId === g.id ? "bg-zinc-900 text-white" : "border border-zinc-300 hover:bg-zinc-50"}`}>
            {g.name}
          </Link>
        ))}
        {groups.length === 0 && <span className="text-xs text-zinc-400">(noch keine Gruppen angelegt)</span>}
      </div>

      <MatrixGrid users={users} days={days} holidays={holidays.map((h) => h.date)} cells={cells} legend={legend} isStaff={staff} requests={requests} currentUserId={me.id} />
    </div>
  );
}
