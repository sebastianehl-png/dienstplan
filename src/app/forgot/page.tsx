"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type ActionResult } from "@/lib/actions";

type Res = (ActionResult & { resetUrl?: string }) | null;

export default function ForgotPage() {
  const [result, action, pending] = useActionState<Res, FormData>((prev, fd) => requestPasswordReset(prev, fd), null);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Passwort zurücksetzen</h1>
        <p className="mt-1 text-sm text-zinc-500">E-Mail eingeben – du erhältst einen Link zum Zurücksetzen.</p>

        <form action={action} className="mt-6 space-y-4">
          <input
            name="email"
            type="email"
            required
            placeholder="name@klinik.de"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button disabled={pending} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {pending ? "…" : "Link erstellen"}
          </button>
        </form>

        {result && (
          <div className="mt-4 space-y-2">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{result.message}</p>
            {result.resetUrl && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Prototyp (kein E-Mail-Versand): <Link href={result.resetUrl} className="font-medium underline">Hier zum Zurücksetzen →</Link>
              </p>
            )}
          </div>
        )}

        <p className="mt-6 text-xs text-zinc-400">
          <Link href="/login" className="hover:underline">← Zurück zum Login</Link>
        </p>
      </div>
    </div>
  );
}
