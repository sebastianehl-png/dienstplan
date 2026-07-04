"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editGroup, type ActionResult } from "@/lib/actions";

export type TypeOption = { code: string; name: string };

export default function EditRequest({
  groupId,
  start,
  end,
  kind,
  typeOptions,
}: {
  groupId: string;
  start: string;
  end: string;
  kind: string;
  typeOptions: TypeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  const [k, setK] = useState(kind);
  const [pending, startT] = useTransition();
  const [flash, setFlash] = useState<ActionResult | null>(null);

  // Freiwunsch ist keine AbsenceType, sondern eigener Eintragstyp
  const options: TypeOption[] = [...typeOptions, { code: "WISH", name: "Freiwunsch" }];

  function save() {
    startT(async () => {
      const r = await editGroup(groupId, s, e, k);
      setFlash(r);
      if (r.level !== "error") {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50">
        Bearbeiten
      </button>
    );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-50 p-2">
      <input type="date" value={s} onChange={(ev) => setS(ev.target.value)} className="rounded border border-zinc-300 px-2 py-1 text-xs" />
      <span className="text-xs text-zinc-400">bis</span>
      <input type="date" value={e} onChange={(ev) => setE(ev.target.value)} className="rounded border border-zinc-300 px-2 py-1 text-xs" />
      <select value={k} onChange={(ev) => setK(ev.target.value)} className="rounded border border-zinc-300 px-2 py-1 text-xs">
        {options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.name}
          </option>
        ))}
      </select>
      <button onClick={save} disabled={pending} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-60">
        Speichern
      </button>
      <button onClick={() => setOpen(false)} className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50">
        Abbrechen
      </button>
      {flash && flash.level === "error" && <span className="text-xs text-red-600">{flash.message}</span>}
    </div>
  );
}
