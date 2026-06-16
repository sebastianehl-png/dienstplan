"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPassword, type ActionResult } from "@/lib/actions";

export default function ResetForm({ token }: { token: string }) {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>((prev, fd) => resetPassword(prev, fd), null);
  const done = result?.level === "ok";

  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      {!done && (
        <>
          <Field label="Neues Passwort (min. 6 Zeichen)" name="next" />
          <Field label="Passwort wiederholen" name="confirm" />
          <button disabled={pending} className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {pending ? "…" : "Passwort setzen"}
          </button>
        </>
      )}
      {result && (
        <p className={`rounded-lg px-3 py-2 text-sm ${result.level === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{result.message}</p>
      )}
      {done && (
        <Link href="/login" className="block text-center text-sm font-medium text-blue-700 hover:underline">
          → Zum Login
        </Link>
      )}
    </form>
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
