"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRowDefault, createSpecialRule, deleteSpecialRule, type ActionResult } from "@/lib/actions";
import { DAY_NAMES } from "@/lib/weekplan-def";

export function DefaultSelect({
  rowKey,
  slot,
  value,
  options,
}: {
  rowKey: string;
  slot: number;
  value: string | null;
  options: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value ?? "");
  const [pending, start] = useTransition();

  function change(next: string) {
    setCurrent(next);
    start(async () => {
      await setRowDefault(rowKey, slot, next || null);
      router.refresh();
    });
  }

  return (
    <select value={current} disabled={pending} onChange={(e) => change(e.target.value)} className="rounded border border-zinc-300 px-2 py-1 text-sm">
      <option value="">{slot === 0 ? "– keine (fair verteilen) –" : "– keiner (Platz bleibt frei) –"}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

export function RuleForm({ users, rows }: { users: { id: string; name: string }[]; rows: { key: string; label: string }[] }) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>((prev, fd) => createSpecialRule(prev, fd), null);
  const [interval, setInterval] = useState("EVERY");

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <Field label="Person">
        <select name="userId" className="rounded border border-zinc-300 px-2 py-2 text-sm">
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Zeile (leer = alle)">
        <select name="rowKey" className="rounded border border-zinc-300 px-2 py-2 text-sm">
          <option value="">– alle Zeilen –</option>
          {rows.map((r) => (
            <option key={r.key} value={r.key}>{r.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Wochentag">
        <select name="weekday" className="rounded border border-zinc-300 px-2 py-2 text-sm">
          {DAY_NAMES.map((d, i) => (
            <option key={i} value={i}>{d}</option>
          ))}
        </select>
      </Field>
      <Field label="Rhythmus">
        <select name="interval" value={interval} onChange={(e) => setInterval(e.target.value)} className="rounded border border-zinc-300 px-2 py-2 text-sm">
          <option value="EVERY">jede Woche</option>
          <option value="BIWEEKLY">jede 2. Woche</option>
        </select>
      </Field>
      {interval === "BIWEEKLY" && (
        <Field label="Referenzdatum (ein betroffener Tag)">
          <input type="date" name="refDate" className="rounded border border-zinc-300 px-2 py-2 text-sm" />
        </Field>
      )}
      <Field label="Notiz (optional)">
        <input name="note" placeholder="z.B. Ambulanztag" className="rounded border border-zinc-300 px-2 py-2 text-sm" />
      </Field>
      <button disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
        {pending ? "…" : "Regel anlegen"}
      </button>
      {result && <span className={`text-sm ${result.level === "error" ? "text-red-600" : "text-emerald-700"}`}>{result.message}</span>}
    </form>
  );
}

export function DeleteRuleButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await deleteSpecialRule(id); router.refresh(); })}
      disabled={pending}
      className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
    >
      Löschen
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
