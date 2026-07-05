"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGroup, setUserGroups, type ActionResult } from "@/lib/actions";

export function CreateGroupForm() {
  const [result, action, pending] = useActionState<ActionResult | null, FormData>((prev, fd) => createGroup(prev, fd), null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input name="name" placeholder="Gruppenname (z.B. Sektion A)" className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500" />
      <button disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
        Gruppe anlegen
      </button>
      {result && <span className={`text-sm ${result.level === "error" ? "text-red-600" : "text-emerald-700"}`}>{result.message}</span>}
    </form>
  );
}

export function MembershipEditor({
  users,
  groups,
}: {
  users: { id: string; name: string; groupIds: string[] }[];
  groups: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, Set<string>>>(
    Object.fromEntries(users.map((u) => [u.id, new Set(u.groupIds)]))
  );
  const [pending, start] = useTransition();
  const [savedFor, setSavedFor] = useState<string | null>(null);

  function toggle(userId: string, groupId: string) {
    setState((cur) => {
      const next = { ...cur };
      const set = new Set(next[userId]);
      if (set.has(groupId)) set.delete(groupId);
      else set.add(groupId);
      next[userId] = set;
      return next;
    });
  }

  function save(userId: string) {
    start(async () => {
      await setUserGroups(userId, Array.from(state[userId]));
      setSavedFor(userId);
      router.refresh();
      setTimeout(() => setSavedFor(null), 1500);
    });
  }

  if (groups.length === 0) return <p className="text-sm text-zinc-400">Erst eine Gruppe anlegen, dann hier Mitglieder zuordnen.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="text-sm">
        <thead>
          <tr className="text-left text-zinc-500">
            <th className="px-3 py-2">Mitarbeiter</th>
            {groups.map((g) => (
              <th key={g.id} className="px-3 py-2 text-center">{g.name}</th>
            ))}
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-zinc-100">
              <td className="whitespace-nowrap px-3 py-1.5 text-zinc-800">
                {u.name}
              </td>
              {groups.map((g) => (
                <td key={g.id} className="px-3 py-1.5 text-center">
                  <input type="checkbox" checked={state[u.id].has(g.id)} onChange={() => toggle(u.id, g.id)} />
                </td>
              ))}
              <td className="px-3 py-1.5">
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
