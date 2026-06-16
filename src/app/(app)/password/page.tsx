"use client";

import { useActionState } from "react";
import { changePassword, type ActionResult } from "@/lib/actions";

export default function PasswordPage() {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>((prev, fd) => changePassword(prev, fd), null);

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-semibold text-zinc-900">Passwort ändern</h1>
      <form action={action} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
        <Field label="Aktuelles Passwort" name="current" />
        <Field label="Neues Passwort (min. 6 Zeichen)" name="next" />
        <Field label="Neues Passwort wiederholen" name="confirm" />
        {result && (
          <div className={`rounded-lg px-3 py-2 text-sm ${result.level === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {result.message}
          </div>
        )}
        <button disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? "Speichert…" : "Passwort ändern"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, name }: { label: string; name: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-700">{label}</label>
      <input name={name} type="password" required className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
    </div>
  );
}
