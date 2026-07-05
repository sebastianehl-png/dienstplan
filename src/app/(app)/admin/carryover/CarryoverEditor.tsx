"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCarryover } from "@/lib/actions";

export default function CarryoverEditor({
  year,
  users,
}: {
  year: number;
  users: { id: string; name: string; days: number }[];
}) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, number>>(Object.fromEntries(users.map((u) => [u.id, u.days])));
  const [pending, start] = useTransition();
  const [savedFor, setSavedFor] = useState<string | null>(null);

  function save(userId: string) {
    start(async () => {
      await setCarryover(userId, year, Number(vals[userId]) || 0);
      setSavedFor(userId);
      router.refresh();
      setTimeout(() => setSavedFor(null), 1500);
    });
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-left text-zinc-500">
          <tr>
            <th className="px-4 py-2">Mitarbeiter</th>
            <th className="px-4 py-2">Resturlaub aus Vorjahr (Tage)</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-zinc-100">
              <td className="px-4 py-2 text-zinc-800">
                {u.name}
              </td>
              <td className="px-4 py-2">
                <input
                  type="number"
                  min={0}
                  value={vals[u.id]}
                  onChange={(e) => setVals((v) => ({ ...v, [u.id]: Number(e.target.value) }))}
                  className="w-24 rounded border border-zinc-300 px-2 py-1"
                />
              </td>
              <td className="px-4 py-2">
                <button onClick={() => save(u.id)} disabled={pending} className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
                  {savedFor === u.id ? "✓ gespeichert" : "Speichern"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
