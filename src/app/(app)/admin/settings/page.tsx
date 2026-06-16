import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDE, weekdayName } from "@/lib/dates";
import SettingsForm from "./SettingsForm";

const PLAN_YEAR = new Date().getFullYear();

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const settings = (await prisma.settings.findUnique({ where: { id: 1 } })) ?? {
    maxConcurrentAbsent: 5,
    vacationDaysPerYear: 30,
    maxWeekendsPerMonth: 2,
  };
  const holidays = await prisma.holiday.findMany({ where: { year: PLAN_YEAR }, orderBy: { date: "asc" } });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Einstellungen</h1>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 font-medium text-zinc-900">Regeln</h2>
        <SettingsForm values={settings} />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 font-medium text-zinc-900">Feiertage {PLAN_YEAR} (NRW)</h2>
        <ul className="grid gap-1 text-sm text-zinc-700 sm:grid-cols-2 lg:grid-cols-3">
          {holidays.map((h) => (
            <li key={h.id}>
              <span className="font-mono text-xs text-zinc-400">{weekdayName(h.date)}</span> {formatDE(h.date)} – {h.name}
            </li>
          ))}
        </ul>
        {holidays.length === 0 && <p className="text-sm text-zinc-400">Noch keine Feiertage – werden bei der Planerstellung automatisch geladen.</p>}
      </div>
    </div>
  );
}
