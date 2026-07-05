"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAssignment } from "@/lib/actions";

export type PlanUser = {
  id: string;
  name: string;
  hg: { from: string | null; to: string | null } | null; // Rufbereitschaft Hintergrund
  vg: { from: string | null; to: string | null } | null; // Rufbereitschaft Vordergrund
};

export type PlanDay = {
  date: string; // YYYY-MM-DD
  label: string; // "Mo 06.07."
  special: boolean; // Fr/Sa/So/Feiertag => HK+VG, sonst WEEKDAY
  holidayName?: string;
};

export type PlanGridData = {
  year: number;
  days: PlanDay[]; // Tage des angezeigten Monats
  cells: Record<string, string>; // `${date}|${slot}` -> userId
  users: PlanUser[];
  absent: Record<string, string[]>; // date -> userIds (freigegeben abwesend)
};

const lastName = (full: string) => full.trim().split(/\s+/).pop() ?? full;

function inRange(r: { from: string | null; to: string | null } | null, date: string): boolean {
  if (!r) return false;
  if (r.from && date < r.from) return false;
  if (r.to && date > r.to) return false;
  return true;
}

export default function PlanGrid({ data }: { data: PlanGridData }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function eligible(date: string, slot: string): PlanUser[] {
    const absent = new Set(data.absent[date] ?? []);
    return data.users.filter((u) => {
      if (absent.has(u.id)) return false;
      // Werktagsdienst & HK nur mit Hintergrund; Vordergrund mit VG oder HG
      if (slot === "VG") return inRange(u.vg, date) || inRange(u.hg, date);
      return inRange(u.hg, date);
    });
  }

  function setCell(date: string, slot: string, value: string) {
    start(async () => {
      await updateAssignment(data.year, date, slot, value === "" ? null : value);
      router.refresh();
    });
  }

  function cellSelect(date: string, slot: string) {
    const current = data.cells[`${date}|${slot}`] ?? "";
    const options = eligible(date, slot);
    const invalid = current !== "" && !options.some((u) => u.id === current);
    const currentName = data.users.find((u) => u.id === current)?.name;
    return (
      <select
        value={current}
        disabled={pending}
        onChange={(e) => setCell(date, slot, e.target.value)}
        title={invalid ? "Person ist abwesend oder hat keine passende Ruf-Fähigkeit" : undefined}
        className={`w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-zinc-300 focus:border-blue-500 focus:outline-none ${
          invalid ? "bg-red-50 text-red-700" : ""
        }`}
      >
        <option value="">–</option>
        {invalid && current && <option value={current}>⚠ {lastName(currentName ?? "?")}</option>}
        {options.map((u) => (
          <option key={u.id} value={u.id}>
            {lastName(u.name)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-zinc-50 text-left text-zinc-600">
            <th className="w-28 border-b border-zinc-200 px-3 py-2">Tag</th>
            <th className="border-b border-l border-zinc-200 px-2 py-2">Vordergrund</th>
            <th className="border-b border-l border-zinc-200 px-2 py-2">Hintergrund (HK)</th>
          </tr>
        </thead>
        <tbody>
          {data.days.map((d) => (
            <tr key={d.date} className={d.special ? "bg-amber-50/40" : ""}>
              <td className="border-t border-zinc-100 px-3 py-1 text-zinc-600">
                {d.label}
                {d.holidayName && <span className="ml-1 text-[10px] text-amber-600">{d.holidayName}</span>}
              </td>
              {d.special ? (
                <>
                  <td className="border-t border-l border-zinc-100 px-1 py-0.5">{cellSelect(d.date, "VG")}</td>
                  <td className="border-t border-l border-zinc-100 px-1 py-0.5">{cellSelect(d.date, "HK")}</td>
                </>
              ) : (
                <>
                  <td className="border-t border-l border-zinc-100 px-1 py-0.5">{cellSelect(d.date, "WEEKDAY")}</td>
                  <td className="border-t border-l border-zinc-100 px-2 py-0.5 text-[10px] text-zinc-400">(inkl. HK)</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
