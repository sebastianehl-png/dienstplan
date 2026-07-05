import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countVacationWeekdays, getVacationLimit } from "@/lib/actions";
import { getRequests } from "@/lib/requests";
import PersonnelForm from "../PersonnelForm";
import SkillsEditor from "../SkillsEditor";

const PLAN_YEAR = new Date().getFullYear();

export default async function PersonnelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isStaff(me.role)) redirect("/dashboard");

  const { id } = await params;
  const user = await prisma.user.findUnique({ where: { id }, include: { groups: { include: { group: true } }, skills: true } });
  if (!user) notFound();

  const [vacUsed, vacLimit, requests] = await Promise.all([
    countVacationWeekdays(user.id, PLAN_YEAR),
    getVacationLimit(user.id, PLAN_YEAR),
    getRequests({ yearPrefix: String(PLAN_YEAR), userId: user.id }),
  ]);

  const roleLabel = user.role === "ADMIN" ? "Admin" : user.role === "SUBADMIN" ? "Sub-Admin" : "Mitarbeiter";
  const jobLabel =
    user.jobRole === "ASSISTENZARZT" ? "Assistenzarzt/-ärztin" : user.jobRole === "VERWALTUNG" ? "Verwaltung" : "Oberarzt/-ärztin";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/personnel" className="text-sm text-blue-700 hover:underline">← Zurück zur Übersicht</Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{user.name}</h1>
        <p className="text-zinc-500">
          {user.email} · {jobLabel} · {roleLabel} · Dienstplan-Kat. {user.category}
          {user.groups.length > 0 && <> · {user.groups.map((g) => g.group.name).join(", ")}</>}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card title={`Urlaub ${PLAN_YEAR}`} value={`${vacUsed} / ${vacLimit}`} warn={vacUsed > vacLimit} />
        <Card title="Anträge gesamt" value={String(requests.length)} />
        <Card title="Status" value={user.active ? "aktiv" : "inaktiv"} />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 font-medium text-zinc-900">Stammdaten</h2>
        <PersonnelForm
          data={{
            userId: user.id,
            position: user.position,
            phone: user.phone,
            address: user.address,
            birthDate: user.birthDate,
            hireDate: user.hireDate,
            weeklyHours: user.weeklyHours,
            emergency: user.emergency,
            staffNotes: user.staffNotes,
          }}
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 font-medium text-zinc-900">Funktion & Fähigkeiten</h2>
        <SkillsEditor
          userId={user.id}
          jobRole={user.jobRole}
          skills={user.skills.map((s) => ({ skill: s.skill, validFrom: s.validFrom, validTo: s.validTo }))}
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 font-medium text-zinc-900">Abwesenheiten {PLAN_YEAR}</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-zinc-400">Keine Einträge.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {requests.map((r) => (
              <li key={r.groupId} className="flex flex-wrap items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded" style={{ backgroundColor: r.kindColor }} />
                <span className="text-zinc-700">
                  {r.start.split("-").reverse().join(".")}
                  {r.end !== r.start && ` – ${r.end.split("-").reverse().join(".")}`}
                </span>
                <span className="text-zinc-500">{r.kindName}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : r.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {r.status === "APPROVED" ? "freigegeben" : r.status === "REJECTED" ? "abgelehnt" : "ausstehend"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Card({ title, value, warn }: { title: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="text-sm text-zinc-500">{title}</div>
      <div className={`mt-1 text-xl font-semibold ${warn ? "text-red-600" : "text-zinc-900"}`}>{value}</div>
    </div>
  );
}
