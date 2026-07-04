import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRequests } from "@/lib/requests";
import { getAbsenceTypes } from "@/lib/absence-types";
import RequestCard from "@/components/RequestCard";

const PLAN_YEAR = new Date().getFullYear();

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isStaff(me.role)) redirect("/dashboard");

  const { status } = await searchParams;
  const [allRequests, types, users] = await Promise.all([
    getRequests({ yearPrefix: String(PLAN_YEAR) }),
    getAbsenceTypes(),
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const typeOptions = types.map((t) => ({ code: t.code, name: t.name }));

  let requests = allRequests;
  if (status === "pending") requests = requests.filter((r) => r.status === "PENDING" || r.status === "MIXED");
  if (status === "approved") requests = requests.filter((r) => r.status === "APPROVED");
  if (status === "rejected") requests = requests.filter((r) => r.status === "REJECTED");

  const tab = (key: string, label: string) => (
    <Link
      href={`/admin/requests${key ? `?status=${key}` : ""}`}
      className={`rounded-md px-3 py-1 text-sm ${(status ?? "") === key ? "bg-zinc-900 text-white" : "border border-zinc-300 hover:bg-zinc-50"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Alle Anträge {PLAN_YEAR}</h1>
        <p className="text-zinc-500">Komplette Dokumentation (eingetragen / geändert / freigegeben) und Kommentare – für alle Sub-Admins.</p>
      </div>

      <div className="flex gap-2">
        {tab("", "Alle")}
        {tab("pending", "Ausstehend")}
        {tab("approved", "Freigegeben")}
        {tab("rejected", "Abgelehnt")}
      </div>

      {requests.length === 0 && <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-500">Keine Anträge.</div>}

      <ul className="space-y-3">
        {requests.map((req) => (
          <RequestCard key={req.groupId} req={req} currentUserId={me.id} showUser canModerate typeOptions={typeOptions} substituteOptions={users} />
        ))}
      </ul>
    </div>
  );
}
