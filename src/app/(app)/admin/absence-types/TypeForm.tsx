"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAbsenceType, toggleAbsenceType, deleteAbsenceType, type ActionResult } from "@/lib/actions";

export type TypeRow = {
  id: string;
  code: string;
  name: string;
  short: string;
  color: string;
  countsAsVacation: boolean;
  countsForLimit: boolean;
  needsApproval: boolean;
  builtin: boolean;
  active: boolean;
};

export function TypeForm({ initial, onDone }: { initial?: TypeRow; onDone?: () => void }) {
  const router = useRouter();
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const r = await saveAbsenceType(prev, fd);
    if (r.level === "ok") {
      router.refresh();
      onDone?.();
    }
    return r;
  }, null);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <Field label="Name" name="name" def={initial?.name} placeholder="z.B. Fortbildung" width="w-44" />
      <Field label="Kürzel" name="short" def={initial?.short} placeholder="FB" width="w-20" />
      <div>
        <label className="block text-xs font-medium text-zinc-600">Farbe</label>
        <input type="color" name="color" defaultValue={initial?.color ?? "#8b5cf6"} className="mt-1 h-9 w-14 rounded border border-zinc-300" />
      </div>
      <Check label="zählt ins Urlaubskonto" name="countsAsVacation" def={initial?.countsAsVacation ?? false} />
      <Check label="zählt ins Abwesenheits-Limit" name="countsForLimit" def={initial?.countsForLimit ?? false} />
      <Check label="Freigabe nötig" name="needsApproval" def={initial?.needsApproval ?? true} />
      <button disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
        {pending ? "…" : initial ? "Speichern" : "Anlegen"}
      </button>
      {onDone && (
        <button type="button" onClick={onDone} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50">
          Abbrechen
        </button>
      )}
      {result && (
        <span className={`text-sm ${result.level === "error" ? "text-red-600" : "text-emerald-700"}`}>{result.message}</span>
      )}
    </form>
  );
}

export function TypeRowActions({ row }: { row: TypeRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (editing) return <TypeForm initial={row} onDone={() => setEditing(false)} />;

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setEditing(true)} className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50">
        Bearbeiten
      </button>
      <button
        onClick={() => start(async () => { await toggleAbsenceType(row.id); router.refresh(); })}
        disabled={pending}
        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
      >
        {row.active ? "Deaktivieren" : "Aktivieren"}
      </button>
      {!row.builtin && (
        <button
          onClick={() => start(async () => { const r = await deleteAbsenceType(row.id); if (r.level === "error") setErr(r.message); else router.refresh(); })}
          disabled={pending}
          className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          Löschen
        </button>
      )}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}

function Field({ label, name, def, placeholder, width }: { label: string; name: string; def?: string; placeholder?: string; width: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600">{label}</label>
      <input name={name} defaultValue={def} placeholder={placeholder} className={`mt-1 ${width} rounded-lg border border-zinc-300 px-2 py-2 text-sm outline-none focus:border-blue-500`} />
    </div>
  );
}

function Check({ label, name, def }: { label: string; name: string; def: boolean }) {
  return (
    <label className="flex items-center gap-1.5 pb-2 text-xs text-zinc-600">
      <input type="checkbox" name={name} defaultChecked={def} />
      {label}
    </label>
  );
}
