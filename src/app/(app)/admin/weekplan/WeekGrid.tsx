"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateWeek, updateWeekCell, publishWeek, deleteWeek, type ActionResult } from "@/lib/actions";
import type { WeekReport } from "@/lib/weekplan";
import { WEEK_ROWS, DAY_NAMES } from "@/lib/weekplan-def";

export type GridCell = { userId: string | null; text: string | null };
export type GridData = {
  weekStart: string;
  status: "NONE" | "DRAFT" | "PUBLISHED";
  cells: Record<string, GridCell>; // `${rowKey}|${day}`
  eligible: Record<string, string[]>; // `${rowKey}|${day}` -> userIds
  users: Record<string, string>; // id -> name
  dayDates: string[]; // 5 Datumsangaben (DD.MM.)
};

const lastName = (full: string) => full.trim().split(/\s+/).pop() ?? full;

export default function WeekGrid({ data }: { data: GridData }) {
  const router = useRouter();
  const [flash, setFlash] = useState<ActionResult | null>(null);
  const [report, setReport] = useState<WeekReport | null>(null);
  const [textMode, setTextMode] = useState<Set<string>>(new Set()); // Zellen im Freitext-Modus
  const [pending, start] = useTransition();

  function run(fn: () => Promise<ActionResult & { report?: WeekReport }>) {
    start(async () => {
      const r = await fn();
      setFlash(r);
      if (r.report) setReport(r.report);
      router.refresh();
    });
  }

  function setCell(rowKey: string, day: number, value: string) {
    if (value === "__TEXT__") {
      // In den Freitext-Modus wechseln (noch nichts speichern)
      setTextMode((cur) => new Set(cur).add(`${rowKey}|${day}`));
      return;
    }
    const userId = value === "" ? null : value;
    start(async () => {
      await updateWeekCell(data.weekStart, rowKey, day, userId, null);
      router.refresh();
    });
  }
  function setCellText(rowKey: string, day: number, text: string) {
    const clean = text.trim();
    if (!clean) {
      // Leerer Freitext: zurück zum Dropdown
      setTextMode((cur) => {
        const next = new Set(cur);
        next.delete(`${rowKey}|${day}`);
        return next;
      });
    }
    start(async () => {
      await updateWeekCell(data.weekStart, rowKey, day, null, clean || null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => run(() => generateWeek(data.weekStart))}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? "…" : data.status === "NONE" ? "Entwurf automatisch erstellen" : "Neu berechnen (überschreibt Änderungen)"}
        </button>
        {data.status === "DRAFT" && (
          <button onClick={() => run(() => publishWeek(data.weekStart))} disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
            Veröffentlichen
          </button>
        )}
        {data.status !== "NONE" && (
          <>
            <a href={`/api/weekplan/${data.weekStart}/docx`} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
              Word herunterladen
            </a>
            <button onClick={() => run(() => deleteWeek(data.weekStart))} disabled={pending} className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 hover:bg-red-100 disabled:opacity-60">
              Verwerfen
            </button>
          </>
        )}
        {data.status === "PUBLISHED" && <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-700">veröffentlicht ✓</span>}
      </div>

      {flash && (
        <div className={`rounded-lg px-3 py-2 text-sm ${flash.level === "error" ? "bg-red-50 text-red-700" : flash.level === "warn" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
          {flash.message}
        </div>
      )}

      {report && (report.gaps.length > 0 || report.doubleBookings.length > 0 || report.defaultsReplaced.length > 0) && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm">
          <div className="font-medium text-zinc-900">Hinweise des Generators</div>
          {report.gaps.map((g, i) => (
            <div key={`g${i}`} className="text-red-700">
              ⚠ Unbesetzt: {rowLabel(g.rowKey)} / {DAY_NAMES[g.day]} — {g.reason}
            </div>
          ))}
          {report.defaultsReplaced.map((d, i) => (
            <div key={`d${i}`} className="text-amber-800">
              ↷ Standard ersetzt: {rowLabel(d.rowKey)} / {DAY_NAMES[d.day]} — {d.defaultName} ({d.reason})
            </div>
          ))}
          {report.doubleBookings.map((b, i) => (
            <div key={`b${i}`} className="text-amber-800">
              ⚠ Doppelbelegung: {b.userName} — {rowLabel(b.rowKey)} / {DAY_NAMES[b.day]}
            </div>
          ))}
        </div>
      )}

      {data.status !== "NONE" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-50 text-left text-zinc-600">
                <th className="border-b border-zinc-200 px-3 py-2"></th>
                {DAY_NAMES.map((d, i) => (
                  <th key={d} className="border-b border-l border-zinc-200 px-2 py-2">
                    {d} <span className="font-normal text-zinc-400">{data.dayDates[i]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {WEEK_ROWS.map((row) => (
                <tr key={row.key}>
                  <td className="max-w-44 border-t border-zinc-100 px-3 py-1.5 font-medium text-zinc-800">{row.label}</td>
                  {[0, 1, 2, 3, 4].map((day) => {
                    const key = `${row.key}|${day}`;
                    if (row.grayDays.includes(day)) return <td key={day} className="border-t border-l border-zinc-100 bg-zinc-200/70" />;
                    const cell = data.cells[key] ?? { userId: null, text: null };
                    if (row.autoAbsences) {
                      return (
                        <td key={day} className="border-t border-l border-zinc-100 px-1 py-1">
                          <input
                            defaultValue={cell.text ?? ""}
                            onBlur={(e) => e.target.value !== (cell.text ?? "") && setCellText(row.key, day, e.target.value)}
                            placeholder="–"
                            className="w-full rounded border border-transparent px-1 py-0.5 text-xs hover:border-zinc-300 focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                      );
                    }
                    const options = data.eligible[key] ?? [];
                    const invalid = cell.userId != null && !options.includes(cell.userId);
                    const inTextMode = textMode.has(key) || cell.text != null;
                    if (inTextMode) {
                      return (
                        <td key={day} className="border-t border-l border-zinc-100 bg-amber-50/40 px-1 py-1">
                          <input
                            autoFocus={textMode.has(key) && cell.text == null}
                            defaultValue={cell.text ?? ""}
                            onBlur={(e) => e.target.value.trim() !== (cell.text ?? "") && setCellText(row.key, day, e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            placeholder="Freitext… (leer = zurück zur Auswahl)"
                            title="Manueller Eintrag (Freitext)"
                            className="w-full rounded border border-transparent px-1 py-0.5 text-xs hover:border-zinc-300 focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={day} className={`border-t border-l border-zinc-100 px-1 py-1 ${invalid ? "bg-red-50" : ""}`}>
                        <select
                          value={cell.userId ?? ""}
                          onChange={(e) => setCell(row.key, day, e.target.value)}
                          title={invalid ? "Person ist abwesend, gesperrt oder ohne Fähigkeit" : undefined}
                          className={`w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-zinc-300 focus:border-blue-500 focus:outline-none ${invalid ? "text-red-700" : ""}`}
                        >
                          <option value="">–</option>
                          {invalid && cell.userId && <option value={cell.userId}>⚠ {lastName(data.users[cell.userId] ?? "?")}</option>}
                          {options.map((id) => (
                            <option key={id} value={id}>
                              {lastName(data.users[id] ?? id)}
                            </option>
                          ))}
                          <option value="__TEXT__">✎ Freitext…</option>
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.status !== "NONE" && (
        <p className="text-xs text-zinc-400">
          Dropdowns zeigen nur Personen mit gültiger Fähigkeit, die an dem Tag anwesend und nicht per Regel gesperrt sind. Rot = aktuelle
          Besetzung verletzt eine Bedingung. Die Rufbereitschaft kommt aus dem Jahres-Dienstplan (Fr = Wochenend-Rufdienst).
        </p>
      )}
    </div>
  );
}

function rowLabel(key: string): string {
  return WEEK_ROWS.find((r) => r.key === key)?.label ?? key;
}
