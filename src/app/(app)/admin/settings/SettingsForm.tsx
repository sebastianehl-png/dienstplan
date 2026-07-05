"use client";

import { useActionState } from "react";
import { updateSettings, type ActionResult } from "@/lib/actions";

export default function SettingsForm({
  values,
}: {
  values: { maxConcurrentAbsent: number; vacationDaysPerYear: number; maxWeekendsPerMonth: number; vgWeekendGapWeeks: number };
}) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(
    (prev, fd) => updateSettings(prev, fd),
    null
  );

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <Num label="Max. gleichzeitig im Urlaub" name="maxConcurrentAbsent" def={values.maxConcurrentAbsent} />
      <Num label="Urlaubstage / Jahr (Mo–Fr)" name="vacationDaysPerYear" def={values.vacationDaysPerYear} />
      <Num label="Max. Wochenenden / Monat" name="maxWeekendsPerMonth" def={values.maxWeekendsPerMonth} />
      <Num label="Vordergrund-Ärzte: Wochenende alle … Wochen" name="vgWeekendGapWeeks" def={values.vgWeekendGapWeeks} />
      <div className="sm:col-span-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "Speichert…" : "Speichern"}
        </button>
      </div>
      {result && (
        <div className={`sm:col-span-3 rounded-lg px-3 py-2 text-sm ${result.level === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {result.message}
        </div>
      )}
    </form>
  );
}

function Num({ label, name, def }: { label: string; name: string; def: number }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600">{label}</label>
      <input name={name} type="number" min={0} defaultValue={def} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
    </div>
  );
}
