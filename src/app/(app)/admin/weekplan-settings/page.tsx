import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { WEEK_ROWS, DAY_NAMES } from "@/lib/weekplan-def";
import { formatDE } from "@/lib/dates";
import { DefaultSelect, RuleForm, DeleteRuleButton } from "./SettingsControls";

export default async function WeekplanSettingsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isStaff(me.role)) redirect("/dashboard");

  const [users, defaults, rules] = await Promise.all([
    prisma.user.findMany({ where: { active: true, jobRole: "OBERARZT" }, orderBy: { name: "asc" }, select: { id: true, name: true, skills: { select: { skill: true } } } }),
    prisma.rowDefault.findMany(),
    prisma.specialRule.findMany({ orderBy: { weekday: "asc" } }),
  ]);
  const defaultByRow = new Map(defaults.map((d) => [d.rowKey, d.userId]));
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  const fillableRows = WEEK_ROWS.filter((r) => r.skill && !r.fromYearPlan);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/weekplan" className="text-sm text-blue-700 hover:underline">← Zum Wochenplan</Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Wochenplan: Standard-OAs & Spezialregeln</h1>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 font-medium text-zinc-900">Standard-Besetzung je Zeile</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Diese Person wird immer gesetzt und nur bei Abwesenheit (oder Regel-Sperre) durch Kolleg:innen mit derselben Fähigkeit ersetzt.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fillableRows.map((row) => {
            const options = users.filter((u) => u.skills.some((s) => s.skill === row.skill)).map((u) => ({ id: u.id, name: u.name }));
            return (
              <div key={row.key} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2">
                <span className="text-sm text-zinc-700">{row.label}</span>
                <DefaultSelect rowKey={row.key} value={defaultByRow.get(row.key) ?? null} options={options} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 font-medium text-zinc-900">Spezialregeln</h2>
        <p className="mb-4 text-sm text-zinc-500">
          Sperren einzelne Personen an bestimmten Wochentagen für eine Zeile (oder alle), z.B. „jeden 2. Mittwoch keine Konsile".
        </p>
        <RuleForm users={users.map((u) => ({ id: u.id, name: u.name }))} rows={fillableRows.map((r) => ({ key: r.key, label: r.label }))} />

        {rules.length > 0 && (
          <ul className="mt-4 space-y-2">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                <span className="font-medium text-zinc-900">{nameOf.get(r.userId) ?? "?"}</span>
                <span className="text-zinc-600">
                  {r.interval === "BIWEEKLY" ? "jeden 2." : "jeden"} {DAY_NAMES[r.weekday]}
                  {r.interval === "BIWEEKLY" && r.refDate ? ` (ab ${formatDE(r.refDate)})` : ""} gesperrt für{" "}
                  {r.rowKey ? WEEK_ROWS.find((w) => w.key === r.rowKey)?.label ?? r.rowKey : "alle Zeilen"}
                </span>
                {r.note && <span className="text-zinc-400">– {r.note}</span>}
                <div className="ml-auto">
                  <DeleteRuleButton id={r.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
