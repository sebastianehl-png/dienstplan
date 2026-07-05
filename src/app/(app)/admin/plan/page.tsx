import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Report } from "@/lib/scheduler";
import { formatDE } from "@/lib/dates";
import PlanActions from "./PlanActions";

const PLAN_YEAR = new Date().getFullYear();

export default async function AdminPlanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStaff(user.role)) redirect("/dashboard");

  const plan = await prisma.plan.findUnique({ where: { year: PLAN_YEAR } });
  const status: "NONE" | "DRAFT" | "RELEASED" = !plan ? "NONE" : (plan.status as "DRAFT" | "RELEASED");
  const report: Report | null = plan?.reportJson ? (JSON.parse(plan.reportJson) as Report) : null;

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
