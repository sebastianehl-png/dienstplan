"use client";

import { useActionState } from "react";
import { createUser, type ActionResult } from "@/lib/actions";

export default function UserForm({ canCreateAdmin }: { canCreateAdmin: boolean }) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>(
    (prev, fd) => createUser(prev, fd),
    null
  );

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
      <Field label="Name" name="name" placeholder="Vorname Nachname" />
      <Field label="E-Mail" name="email" type="email" placeholder="name@klinik.de" />
      <div>
        <label className="block text-xs font-medium text-zinc-600">Kategorie</label>
        <select name="category" className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm">
          <option value="1">Kat. 1 (VG + HK)</option>
          <option value="2">Kat. 2 (nur VG)</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-600">Rolle</label>
        <select name="role" className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm">
          <option value="DOCTOR">Arzt</option>
          <option value="SUBADMIN">Sub-Admin</option>
          {canCreateAdmin && <option value="ADMIN">Admin</option>}
        </select>
      </div>
      <Field label="Passwort" name="password" type="text" placeholder="Startpasswort" />
      <button
        type="submit"
        disabled={pending}
        className="h-[38px] rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {pending ? "…" : "Anlegen"}
      </button>

      {result && (
        <div
          className={`sm:col-span-2 lg:col-span-6 rounded-lg px-3 py-2 text-sm ${
            result.level === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {result.message}
        </div>
      )}
    </form>
  );
}

function Field({ label, name, type = "text", placeholder }: { label: string; name: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600">{label}</label>
      <input name={name} type={type} placeholder={placeholder} className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm outline-none focus:border-blue-500" />
    </div>
  );
}
