import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countVacationWeekdays, getVacationLimit } from "@/lib/actions";

const PLAN_YEAR = new Date().getFullYear();

export default async function Dashboard() {
  const user = await requireUser();
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  const vacationLimit = await getVacationLimit(user.id, PLAN_YEAR);

  const used = await countVacationWeekdays(user.id, PLAN_YEAR);
  const pending = await prisma.absence.count({ where: { userId: user.id, status: "PENDING", date: { startsWith: String(PLAN_YEAR) } } });
  const { getAbsenceTypes } = await import("@/lib/absence-types");
  const nonVacationCodes = (await getAbsenceTypes(true)).filter((t) => !t.countsAsVacation).map((t) => t.code);
  const special = await prisma.absence.count({
    where: { userId: user.id, type: { in: nonVacationCodes }, date: { startsWith: String(PLAN_YEAR) } },
  });
  const wishes = await prisma.wish.count({ where: { userId: user.id, date: { startsWith: String(PLAN_YEAR) } } });
  const plan = await prisma.plan.findUnique({ where: { year: PLAN_YEAR } });

  const myDuties = plan
    ? await prisma.assignment.count({ where: { planId: plan.id, userId: user.id } })
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Hallo {user.name.split(" ")[0]} 👋</h1>
        <p className="text-zinc-500">Planungsjahr {PLAN_YEAR}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Urlaub freigegeben" value={`${used} / ${vacationLimit}`} hint={used > vacationLimit ? "Kontingent überschritten!" : pending > 0 ? `${pending} Tag(e) ausstehend` : "Werktage Mo–Fr"} warn={used > vacationLimit} />
        <Card title="Weitere Abwesenheiten" value={String(special)} hint="Sonderurlaub, Krankheit …" />
        <Card title="Freiwünsche" value={String(wishes)} hint="bevorzugt berücksichtigt" />
        <Card title="Meine Dienste" value={plan ? String(myDuties) : "–"} hint={plan ? (plan.status === "RELEASED" ? "Plan freigegeben" : "Plan vorläufig") : "noch kein Plan"} />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-medium text-zinc-900">Nächste Schritte</h2>
        <ul className="mt-3 space-y-2 text-sm text-zinc-600">
          <li>• <Link href="/calendar" className="text-blue-700 hover:underline">Urlaub & Freiwünsche eintragen</Link> für {PLAN_YEAR}.</li>
          <li>• <Link href="/team" className="text-blue-700 hover:underline">Team-Abwesenheiten</Link> ansehen (max. {settings?.maxConcurrentAbsent ?? 5} gleichzeitig im Urlaub).</li>
          <li>• <Link href="/plan" className="text-blue-700 hover:underline">Dienstplan</Link> ansehen, sobald er freigegeben ist.</li>
        </ul>
      </div>
    </div>
  );
}

function Card({ title, value, hint, warn }: { title: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="text-sm text-zinc-500">{title}</div>
      <div className={`mt-1 text-2xl font-semibold ${warn ? "text-red-600" : "text-zinc-900"}`}>{value}</div>
      {hint && <div className={`mt-1 text-xs ${warn ? "text-red-500" : "text-zinc-400"}`}>{hint}</div>}
    </div>
  );
}
