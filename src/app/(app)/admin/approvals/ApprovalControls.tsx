"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveGroup, rejectGroup, approveAllPending, type ActionResult } from "@/lib/actions";

export function BulkApprove() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<ActionResult | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => start(async () => { const r = await approveAllPending(); setFlash(r); router.refresh(); })}
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? "…" : "Alle freigeben"}
      </button>
      {flash && <span className={`text-sm ${flash.level === "warn" ? "text-amber-700" : "text-emerald-700"}`}>{flash.message}</span>}
    </div>
  );
}

export function RowActions({ groupId }: { groupId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function approve() {
    start(async () => {
      const r = await approveGroup(groupId);
      if (r.level === "error") setErr(r.message);
      else { setErr(null); router.refresh(); }
    });
  }
  function reject() {
    start(async () => { await rejectGroup(groupId); router.refresh(); });
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={approve} disabled={pending} className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
        Freigeben
      </button>
      <button onClick={reject} disabled={pending} className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50">
        Ablehnen
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
