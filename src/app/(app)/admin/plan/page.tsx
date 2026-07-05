import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Report } from "@/lib/scheduler";
import { formatDE, weekday, weekdayName } from "@/lib/dates";
import PlanActions from "./PlanActions";
import PlanGrid, { type PlanGridData, type PlanUser } from "./PlanGrid";

const PLAN_YEAR = new Date().getFullYear();
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const pad = (n: number) => String(n).padStart(2, "0");

export default async function AdminPlanPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStaff(user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const month = Math.min(12, Math.max(1, Number(sp.month) || new Date().getMonth() + 1));

  const plan = await prisma.plan.findUnique({ where: { year: PLAN_YEAR } });
  const status: "NONE" | "DRAFT" | "RELEASED" = !plan ? "NONE" : (plan.status as "DRAFT" | "RELEASED");
  const report: Report | null = plan?.reportJson ? (JSON.parse(plan.reportJson) as Report) : null;

  // ---- Daten für die editierbare Monatsansicht ----
  let gridData: PlanGridData | null = null;
  if (plan) {
    const monthPrefix = `${PLAN_YEAR}-${pad(month)}`;
    const [assignments, holidays, absences, oas] = await Promise.all([
      prisma.assignment.findMany({ where: { planId: plan.id, date: { startsWith: monthPrefix } } }),
      prisma.holiday.findMany({ where: { date: { startsWith: monthPrefix } } }),
      prisma.absence.findMany({ where: { status: "APPROVED", date: { startsWith: monthPrefix } }, select: { userId: true, date: true } }),
      prisma.user.findMany({
        where: { active: true, jobRole: "OBERARZT" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, skills: { where: { skill: { in: ["RUF_HG", "RUF_VG"] } } } },
      }),
    ]);

    const holidayByDate = new Map(holidays.map((h) => [h.date, h.name]));
    const users: PlanUser[] = oas.map((u) => {
      const hg = u.skills.find((s) => s.skill === "RUF_HG");
      const vg = u.skills.find((s) => s.skill === "RUF_VG");
      return {
        id: u.id,
        name: u.name,
        hg: hg ? { from: hg.validFrom, to: hg.validTo } : null,
        vg: vg ? { from: vg.validFrom, to: vg.validTo } : null,
      };
    });

    const absent: Record<string, string[]> = {};
    for (const a of absences) (absent[a.date] ??= []).push(a.userId);

    const cells: Record<string, string> = {};
    for (const a of assignments) cells[`${a.date}|${a.slot}`] = a.userId;

    const daysInMonth = new Date(Date.UTC(PLAN_YEAR, month, 0)).getUTCDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const date = `${monthPrefix}-${pad(i + 1)}`;
      const w = weekday(date);
      const special = w === 0 || w === 5 || w === 6 || holidayByDate.has(date);
      return { date, label: `${weekdayName(date)} ${formatDE(date).slice(0, 6)}`, special, holidayName: holidayByDate.get(date) };
    });

    gridData = { year: PLAN_YEAR, days, cells, users, absent };
  }

  const prevMonth = month === 1 ? 12 : month - 1;
  const nextMonth = month === 12 ? 1 : month + 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Dienstplan erstellen · {PLAN_YEAR}</h1>
        <p className="text-zinc-500">
          Status:{" "}
          {status === "NONE" ? "noch kein Plan" : status === "DRAFT" ? "vorläufig (nicht freigegeben)" : "freigegeben ✓"}
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          Eingeplant werden Oberärzt:innen nach Fähigkeit: <strong>Rufbereitschaft (Hintergrund)</strong> = Werktagsdienst + HK am
          Wochenende, <strong>nur Rufbereitschaft (Vordergrund)</strong> = Wochenend-Vordergrund. Ohne Ruf-Fähigkeit keine Einplanung.
        </p>
      </div>

      <PlanActions year={PLAN_YEAR} status={status} />

      {gridData && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-medium text-zinc-900">Plan bearbeiten</h2>
            <div className="flex items-center gap-1">
              <Link href={`/admin/plan?month=${prevMonth}`} className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50">←</Link>
              <span className="min-w-28 text-center text-sm font-medium">{MONTHS[month - 1]}</span>
              <Link href={`/admin/plan?month=${nextMonth}`} className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50">→</Link>
            </div>
            <span className="text-xs text-zinc-400">
              Änderungen gelten sofort. „Plan neu berechnen“ überschreibt manuelle Anpassungen.
            </span>
          </div>
          <PlanGrid data={gridData} />
          <p className="text-xs text-zinc-400">
            Dropdowns zeigen nur anwesende Ärzt:innen mit passender Ruf-Fähigkeit (Werktag/HK = Hintergrund, Vordergrund = VG oder HG).
            Rot = aktuelle Besetzung verletzt eine Bedingung. Regeln wie „Montag nach Wochenenddienst frei" prüft nur der Generator.
          </p>
        </div>
      )}

      {report && (
        <div className="space-y-5">
          {/* Engpässe */}
          <Section title={`Unbesetzte Stellen (${report.uncovered.length})`} tone={report.uncovered.length ? "red" : "green"}>
            {report.uncovered.length === 0 ? (
              <p className="text-sm text-emerald-700">Alle Dienste sind besetzt. 🎉</p>
            ) : (
              <ul className="space-y-1 text-sm text-red-700">
                {report.uncovered.map((u, i) => (
                  <li key={i}>
                    {u.date} · {u.slot} — {u.reason}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Verletzte Freiwünsche */}
          <Section title={`Nicht erfüllte Freiwünsche (${report.wishViolations.length})`} tone={report.wishViolations.length ? "amber" : "green"}>
            {report.wishViolations.length === 0 ? (
              <p className="text-sm text-emerald-700">Alle Freiwünsche konnten berücksichtigt werden.</p>
            ) : (
              <ul className="grid gap-1 text-sm text-amber-800 sm:grid-cols-2">
                {report.wishViolations.map((v, i) => (
                  <li key={i}>
                    {v.name} – {formatDE(v.date)}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Wochenend-Obergrenze überschritten */}
          {report.weekendCapExceeded.length > 0 && (
            <Section title={`Wochenend-Obergrenze überschritten (${report.weekendCapExceeded.length})`} tone="amber">
              <ul className="space-y-1 text-sm text-amber-800">
                {report.weekendCapExceeded.map((w, i) => (
                  <li key={i}>
                    {w.name} – Monat {w.month}: {w.count} Wochenenden
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Verteilung */}
          <Section title="Verteilung der Dienste" tone="plain">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr>
                    <th className="py-1 pr-4">Arzt</th>
                    <th className="py-1 pr-4">Rufdienst</th>
                    <th className="py-1 pr-4">Werktage</th>
                    <th className="py-1 pr-4">Wochenende/Feiertag</th>
                    <th className="py-1 pr-4">HK</th>
                    <th className="py-1 pr-4">Vordergrund</th>
                  </tr>
                </thead>
                <tbody>
                  {report.distribution.map((d) => (
                    <tr key={d.userId} className="border-t border-zinc-100">
                      <td className="py-1 pr-4 text-zinc-800">{d.name}</td>
                      <td className="py-1 pr-4">{d.category === 1 ? "HG" : "VG"}</td>
                      <td className="py-1 pr-4">{d.weekdayCount}</td>
                      <td className="py-1 pr-4">{d.weekendUnits}</td>
                      <td className="py-1 pr-4">{d.hkCount}</td>
                      <td className="py-1 pr-4">{d.vgCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, tone, children }: { title: string; tone: "red" | "amber" | "green" | "plain"; children: React.ReactNode }) {
  const ring =
    tone === "red" ? "border-red-200" : tone === "amber" ? "border-amber-200" : tone === "green" ? "border-emerald-200" : "border-zinc-200";
  return (
    <div className={`rounded-xl border bg-white p-5 ${ring}`}>
      <h2 className="mb-3 font-medium text-zinc-900">{title}</h2>
      {children}
    </div>
  );
}
