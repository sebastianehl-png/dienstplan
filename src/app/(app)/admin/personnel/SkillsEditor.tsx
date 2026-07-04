"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateJobRole, updateSkills, type ActionResult } from "@/lib/actions";
import { SKILLS } from "@/lib/skills";

type Entry = { skill: string; validFrom: string | null; validTo: string | null };

export default function SkillsEditor({
  userId,
  jobRole,
  skills,
}: {
  userId: string;
  jobRole: string;
  skills: Entry[];
}) {
  const router = useRouter();
  const [role, setRole] = useState(jobRole);
  const [state, setState] = useState<Map<string, Entry>>(new Map(skills.map((s) => [s.skill, s])));
  const [pending, start] = useTransition();
  const [flash, setFlash] = useState<ActionResult | null>(null);

  const visible = SKILLS.filter((s) => s.forRole === role);

  function toggle(code: string) {
    setState((cur) => {
      const next = new Map(cur);
      if (next.has(code)) next.delete(code);
      else next.set(code, { skill: code, validFrom: null, validTo: null });
      return next;
    });
  }
  function setDate(code: string, which: "validFrom" | "validTo", value: string) {
    setState((cur) => {
      const next = new Map(cur);
      const e = next.get(code);
      if (e) next.set(code, { ...e, [which]: value || null });
      return next;
    });
  }

  function changeRole(next: string) {
    setRole(next);
    start(async () => {
      await updateJobRole(userId, next as "OBERARZT" | "ASSISTENZARZT");
      router.refresh();
    });
  }

  function save() {
    start(async () => {
      // Nur Fähigkeiten der aktuellen Funktion speichern
      const allowed = new Set(visible.map((s) => s.code));
      const entries = Array.from(state.values()).filter((e) => allowed.has(e.skill));
      const r = await updateSkills(userId, entries);
      setFlash(r);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-zinc-700">Funktion:</label>
        <select value={role} disabled={pending} onChange={(e) => changeRole(e.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm">
          <option value="OBERARZT">Oberarzt/-ärztin</option>
          <option value="ASSISTENZARZT">Assistenzarzt/-ärztin</option>
        </select>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((s) => {
          const entry = state.get(s.code);
          return (
            <div key={s.code} className={`rounded-lg border px-3 py-2 ${entry ? "border-blue-200 bg-blue-50/40" : "border-zinc-100"}`}>
              <label className="flex items-center gap-2 text-sm text-zinc-800">
                <input type="checkbox" checked={!!entry} onChange={() => toggle(s.code)} />
                {s.label}
              </label>
              {entry && s.dates !== "none" && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span>{s.dates === "from" ? "ab" : "von"}</span>
                  <input type="date" value={entry.validFrom ?? ""} onChange={(e) => setDate(s.code, "validFrom", e.target.value)} className="rounded border border-zinc-300 px-2 py-1" />
                  {s.dates === "fromTo" && (
                    <>
                      <span>bis</span>
                      <input type="date" value={entry.validTo ?? ""} onChange={(e) => setDate(s.code, "validTo", e.target.value)} className="rounded border border-zinc-300 px-2 py-1" />
                    </>
                  )}
                  <span className="text-zinc-400">(leer = unbegrenzt)</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={pending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {pending ? "Speichert…" : "Fähigkeiten speichern"}
        </button>
        {flash && <span className={`text-sm ${flash.level === "error" ? "text-red-600" : "text-emerald-700"}`}>{flash.message}</span>}
      </div>
    </div>
  );
}
