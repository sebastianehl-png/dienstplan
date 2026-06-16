"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generatePlan, releasePlan, deletePlan, type ActionResult } from "@/lib/actions";

export default function PlanActions({ year, status }: { year: number; status: "NONE" | "DRAFT" | "RELEASED" }) {
  const router = useRouter();
  const [flash, setFlash] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await fn();
      setFlash(res);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run(() => generatePlan(year))}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Berechne…" : status === "NONE" ? "Vorläufigen Plan erstellen" : "Plan neu berechnen"}
        </button>

        {status === "DRAFT" && (
          <button
            onClick={() => run(() => releasePlan(year))}
            disabled={pending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            Für alle freigeben
          </button>
        )}
        {status !== "NONE" && (
          <button
            onClick={() => run(() => deletePlan(year))}
            disabled={pending}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            Verwerfen
          </button>
        )}
      </div>

      {flash && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            flash.level === "error" ? "bg-red-50 text-red-700" : flash.level === "warn" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {flash.message}
        </div>
      )}
    </div>
  );
}
