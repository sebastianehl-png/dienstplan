"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { updatePersonnel, type ActionResult } from "@/lib/actions";

export type PersonnelData = {
  userId: string;
  position: string | null;
  phone: string | null;
  address: string | null;
  birthDate: string | null;
  hireDate: string | null;
  weeklyHours: number | null;
  emergency: string | null;
  staffNotes: string | null;
};

export default function PersonnelForm({ data }: { data: PersonnelData }) {
  const router = useRouter();
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(async (prev, fd) => {
    const r = await updatePersonnel(prev, fd);
    if (r.level === "ok") router.refresh();
    return r;
  }, null);

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="userId" value={data.userId} />
      <Field label="Position / Funktion" name="position" def={data.position} placeholder="z.B. Oberärztin Kardiologie" />
      <Field label="Telefon" name="phone" def={data.phone} placeholder="+49 …" />
      <Field label="Adresse" name="address" def={data.address} placeholder="Straße, PLZ Ort" />
      <Field label="Notfallkontakt" name="emergency" def={data.emergency} placeholder="Name, Telefon" />
      <Field label="Geburtsdatum" name="birthDate" def={data.birthDate} type="date" />
      <Field label="Eintrittsdatum" name="hireDate" def={data.hireDate} type="date" />
      <Field label="Wochenstunden" name="weeklyHours" def={data.weeklyHours?.toString() ?? ""} placeholder="z.B. 40" />
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-zinc-600">Notizen (nur für Sub-Admins sichtbar)</label>
        <textarea
          name="staffNotes"
          defaultValue={data.staffNotes ?? ""}
          rows={3}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? "Speichert…" : "Personalakte speichern"}
        </button>
        {result && <span className={`text-sm ${result.level === "error" ? "text-red-600" : "text-emerald-700"}`}>{result.message}</span>}
      </div>
    </form>
  );
}

function Field({ label, name, def, placeholder, type = "text" }: { label: string; name: string; def: string | null; placeholder?: string; type?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600">{label}</label>
      <input
        name={name}
        type={type}
        defaultValue={def ?? ""}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
      />
    </div>
  );
}
