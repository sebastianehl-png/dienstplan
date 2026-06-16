"use client";

import { useActionState } from "react";
import { signIn, type ActionResult } from "@/lib/actions";

export default function LoginPage() {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, formData) => signIn(_prev, formData),
    null
  );

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Dienstplanung Oberärzte</h1>
        <p className="mt-1 text-sm text-zinc-500">Bitte anmelden, um Wünsche und Urlaub einzutragen.</p>

        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700">E-Mail</label>
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="name@klinik.de"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Passwort</label>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              placeholder="••••••••"
            />
          </div>

          {result && result.level === "error" && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{result.message}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? "Anmelden…" : "Anmelden"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <a href="/forgot" className="text-sm text-blue-700 hover:underline">Passwort vergessen?</a>
        </div>

        <p className="mt-6 text-xs text-zinc-400">
          Demo-Login: <span className="font-mono">admin@klinik.de</span> / <span className="font-mono">passwort</span>
        </p>
      </div>
    </div>
  );
}
