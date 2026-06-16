"use client";

import { useState } from "react";
import { weekday } from "@/lib/dates";
import CommentBox, { type CommentItem } from "@/app/(app)/entries/CommentBox";
import { RowActions } from "@/app/(app)/admin/approvals/ApprovalControls";

export type Cell = { letter: "U" | "SU" | "FW"; type: "VACATION" | "SPECIAL" | "WISH"; status: string; groupId: string };
export type ReqDetail = {
  groupId: string;
  userName: string;
  kind: "VACATION" | "SPECIAL" | "WISH";
  start: string;
  end: string;
  days: number;
  weekdays: number;
  status: string;
  createdAt: string;
  modifiedAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  comments: CommentItem[];
};

// Farben: Urlaub gelb, Sonderurlaub blau, Freiwunsch cyan, abgelehnt rot.
const COLORS: Record<string, string> = { VACATION: "#eab308", SPECIAL: "#3b82f6", WISH: "#06b6d4" };
const REJECTED_COLOR = "#ef4444";
const KIND_LABEL: Record<string, string> = { VACATION: "Urlaub", SPECIAL: "Sonderurlaub", WISH: "Freiwunsch" };
const STATUS_LABEL: Record<string, string> = { APPROVED: "freigegeben", PENDING: "ausstehend", REJECTED: "abgelehnt", MIXED: "teilweise freigegeben" };

function dt(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
const de = (d: string) => `${d.slice(8)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

export default function MatrixGrid({
  users,
  days,
  holidays,
  cells,
  isStaff,
  requests,
  currentUserId,
}: {
  users: { id: string; name: string; category: number }[];
  days: string[];
  holidays: string[];
  cells: Record<string, Cell>;
  isStaff: boolean;
  requests: Record<string, ReqDetail>;
  currentUserId: string;
}) {
  const holidaySet = new Set(holidays);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const detail = openGroup ? requests[openGroup] : null;

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-left font-medium text-zinc-500">Mitarbeiter</th>
              {days.map((d) => {
                const w = weekday(d);
                const we = w === 0 || w === 6 || holidaySet.has(d);
                return (
                  <th key={d} className={`w-6 px-0 py-1 text-center font-normal ${we ? "bg-zinc-100 text-zinc-400" : "text-zinc-500"}`}>
                    {Number(d.slice(8))}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.id === currentUserId ? "bg-blue-50/40" : ""}>
                <td className="sticky left-0 z-10 whitespace-nowrap border-t border-zinc-100 bg-white px-3 py-1.5 text-zinc-800">
                  {u.name} <span className="text-[10px] text-zinc-400">K{u.category}</span>
                </td>
                {days.map((d) => {
                  const cell = cells[`${u.id}|${d}`];
                  const w = weekday(d);
                  const we = w === 0 || w === 6 || holidaySet.has(d);
                  if (!cell) return <td key={d} className={`h-6 w-6 border-t border-l border-zinc-100 ${we ? "bg-zinc-50" : ""}`} />;

                  const rejected = cell.status === "REJECTED";
                  const approved = cell.status === "APPROVED";
                  const color = rejected ? REJECTED_COLOR : COLORS[cell.type];
                  const solid = approved || rejected;
                  const style: React.CSSProperties = solid
                    ? { backgroundColor: color }
                    : { backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 3px, transparent 3px 6px)` };
                  // gelb braucht dunkle Schrift
                  const textCls = solid ? (cell.type === "VACATION" && !rejected ? "text-zinc-900" : "text-white") : "text-zinc-700";
                  const clickable = !!requests[cell.groupId];
                  return (
                    <td
                      key={d}
                      onClick={clickable ? () => setOpenGroup(cell.groupId) : undefined}
                      title={`${u.name}: ${KIND_LABEL[cell.type]} (${STATUS_LABEL[cell.status] ?? cell.status})${clickable ? " – klicken für Details" : ""}`}
                      className={`h-6 w-6 border-t border-l border-zinc-100 text-center align-middle text-[9px] font-semibold ${textCls} ${clickable ? "cursor-pointer" : ""}`}
                      style={style}
                    >
                      {cell.letter}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legende */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
        <Legend color={COLORS.VACATION} label="Urlaub (U)" />
        <Legend color={COLORS.SPECIAL} label="Sonderurlaub (SU)" />
        <Legend color={COLORS.WISH} label="Freiwunsch (FW)" />
        <Legend color={REJECTED_COLOR} label="abgelehnt" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundImage: "repeating-linear-gradient(45deg, #eab308 0 2px, transparent 2px 4px)" }} />
          ausstehend
        </span>
      </div>

      {/* Detail-Popup */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpenGroup(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">{detail.userName}</h2>
                <p className="text-sm text-zinc-600">
                  {KIND_LABEL[detail.kind]} ·{" "}
                  {detail.start === detail.end ? de(detail.start) : `${de(detail.start)} – ${de(detail.end)}`} ({detail.days} Tage
                  {detail.kind === "VACATION" ? `, ${detail.weekdays} Werktage` : ""})
                </p>
              </div>
              <button onClick={() => setOpenGroup(null)} className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-100">✕</button>
            </div>

            <div className="mt-3 space-y-1 text-sm">
              <Row label="Status" value={STATUS_LABEL[detail.status] ?? detail.status} />
              <Row label="Eingetragen" value={dt(detail.createdAt)} />
              {detail.modifiedAt && <Row label="Geändert" value={dt(detail.modifiedAt)} />}
              {detail.approvedAt && <Row label="Freigegeben" value={`${dt(detail.approvedAt)}${detail.approvedByName ? ` von ${detail.approvedByName}` : ""}`} />}
            </div>

            {isStaff && (
              <div className="mt-4 border-t border-zinc-100 pt-3">
                <h3 className="mb-2 text-sm font-medium text-zinc-700">Entscheidung</h3>
                <RowActions groupId={detail.groupId} />
              </div>
            )}

            <div className="mt-4 border-t border-zinc-100 pt-3">
              <h3 className="mb-1 text-sm font-medium text-zinc-700">Kommentare</h3>
              <CommentBox groupId={detail.groupId} comments={detail.comments} currentUserId={currentUserId} canModerate={isStaff} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-28 shrink-0 text-zinc-400">{label}:</span>
      <span className="text-zinc-800">{value}</span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
