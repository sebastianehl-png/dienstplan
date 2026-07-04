import type { LeaveRequest } from "@/lib/requests";
import { formatDE, weekdayName } from "@/lib/dates";
import CommentBox from "@/app/(app)/entries/CommentBox";
import { RowActions } from "@/app/(app)/admin/approvals/ApprovalControls";
import EditRequest, { type TypeOption } from "@/components/EditRequest";
import SubstituteSelect from "@/components/SubstituteSelect";

const STATUS: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: "freigegeben", cls: "bg-emerald-100 text-emerald-700" },
  PENDING: { label: "ausstehend", cls: "bg-amber-100 text-amber-700" },
  REJECTED: { label: "abgelehnt", cls: "bg-red-100 text-red-700" },
  MIXED: { label: "teilweise freigegeben", cls: "bg-amber-100 text-amber-700" },
};

function dt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function rangeText(req: LeaveRequest): string {
  if (req.start === req.end) return `${weekdayName(req.start)} ${formatDE(req.start)}`;
  return `${formatDE(req.start)} – ${formatDE(req.end)} (${req.days} Tage)`;
}

export default function RequestCard({
  req,
  currentUserId,
  showUser = false,
  canModerate = false,
  canEditOwn = false,
  typeOptions = [],
  substituteOptions = [],
}: {
  req: LeaveRequest;
  currentUserId: string;
  showUser?: boolean;
  canModerate?: boolean;
  canEditOwn?: boolean;
  typeOptions?: TypeOption[];
  substituteOptions?: { id: string; name: string }[];
}) {
  const s = STATUS[req.status];
  const editable = canModerate || (canEditOwn && req.status === "PENDING");
  const canSetSubstitute = req.target === "absence" && (canModerate || (canEditOwn && req.status === "PENDING"));

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        {showUser && <span className="font-medium text-zinc-900">{req.userName}</span>}
        <span className="text-sm text-zinc-700">{rangeText(req)}</span>
        <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: req.kindColor }}>
          {req.kindShort} · {req.kindName}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${s.cls}`}>{s.label}</span>
        {req.vacationCounting && <span className="text-xs text-zinc-400">{req.weekdays} Werktag(e)</span>}
        {canModerate && req.status !== "APPROVED" && (
          <div className="ml-auto">
            <RowActions groupId={req.groupId} />
          </div>
        )}
      </div>

      {/* Vertretung */}
      {req.target === "absence" && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>Vertretung:</span>
          {canSetSubstitute && substituteOptions.length > 0 ? (
            <SubstituteSelect groupId={req.groupId} value={req.substituteId} options={substituteOptions.filter((o) => o.id !== req.userId)} />
          ) : (
            <span className="text-zinc-700">{req.substituteName ?? "–"}</span>
          )}
        </div>
      )}

      {/* Dokumentation */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>Eingetragen: {dt(req.createdAt)}</span>
        {req.modifiedAt && <span className="text-amber-600">Geändert: {dt(req.modifiedAt)}</span>}
        {req.approvedAt && (
          <span className="text-emerald-600">
            Freigegeben: {dt(req.approvedAt)}
            {req.approvedByName ? ` von ${req.approvedByName}` : ""}
          </span>
        )}
      </div>

      {/* Protokoll (nur für Staff) */}
      {canModerate && req.logs.length > 0 && (
        <details className="mt-2 text-xs text-zinc-500">
          <summary className="cursor-pointer select-none hover:text-zinc-700">Protokoll ({req.logs.length})</summary>
          <ul className="mt-1 space-y-0.5 pl-2">
            {req.logs.map((l, i) => (
              <li key={i}>
                {dt(l.at)} · {actionLabel(l.action)}
                {l.byName ? ` (${l.byName})` : ""}
                {l.detail ? ` – ${l.detail}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}

      {editable && (
        <div className="mt-2">
          <EditRequest groupId={req.groupId} start={req.start} end={req.end} kind={req.kind} typeOptions={typeOptions} />
        </div>
      )}

      <CommentBox groupId={req.groupId} comments={req.comments} currentUserId={currentUserId} canModerate={canModerate} />
    </li>
  );
}

function actionLabel(a: string): string {
  return a === "CREATED" ? "eingetragen" : a === "MODIFIED" ? "geändert" : a === "APPROVED" ? "freigegeben" : a === "REJECTED" ? "abgelehnt" : a;
}
