import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequests } from "@/lib/requests";
import { getAbsenceTypes } from "@/lib/absence-types";
import RequestCard from "@/components/RequestCard";

const PLAN_YEAR = new Date().getFullYear();

export default async function EntriesPage() {
  const user = await requireUser();
  const [requests, types, users] = await Promise.all([
    getRequests({ yearPrefix: String(PLAN_YEAR), userId: user.id }),
    getAbsenceTypes(),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const typeOptions = types.map((t) => ({ code: t.code, name: t.name }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Meine Einträge {PLAN_YEAR}</h1>
        <p className="text-zinc-500">{requests.length} Antrag/Anträge. Ausstehende Anträge kannst du bearbeiten und eine Vertretung benennen.</p>
      </div>

      {requests.length === 0 && <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-500">Noch keine Einträge.</div>}

      <ul className="space-y-3">
        {requests.map((req) => (
          <RequestCard key={req.groupId} req={req} currentUserId={user.id} canEditOwn typeOptions={typeOptions} substituteOptions={users} />
        ))}
      </ul>
    </div>
  );
}
