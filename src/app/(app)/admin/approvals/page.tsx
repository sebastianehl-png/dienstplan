import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getRequests } from "@/lib/requests";
import RequestCard from "@/components/RequestCard";
import { BulkApprove } from "./ApprovalControls";

const PLAN_YEAR = new Date().getFullYear();

export default async function ApprovalsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isStaff(me.role)) redirect("/dashboard");

  const requests = await getRequests({ yearPrefix: String(PLAN_YEAR), pendingOnly: true });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Freigaben</h1>
          <p className="text-zinc-500">{requests.length} ausstehende(r) Antrag/Anträge. Ganze Zeiträume werden auf einmal freigegeben.</p>
        </div>
        {requests.length > 0 && <BulkApprove />}
      </div>

      {requests.length === 0 && <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-500">Keine offenen Freigaben. 🎉</div>}

      <ul className="space-y-3">
        {requests.map((req) => (
          <RequestCard key={req.groupId} req={req} currentUserId={me.id} showUser canModerate />
        ))}
      </ul>
    </div>
  );
}
