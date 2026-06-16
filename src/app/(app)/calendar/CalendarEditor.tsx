"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRange, type ActionResult } from "@/lib/actions";
import { addDays, weekday } from "@/lib/dates";

type Kind = "VACATION" | "SPECIAL" | "WISH";
type Mode = Kind | "NONE";
type Entry = { type: Kind; status: string };

const MODES: { mode: Mode; label: string; cls: string }[] = [
  { mode: "VACATION", label: "Urlaub", cls: "bg-yellow-400" },
  { mode: "SPECIAL", label: "Sonderurlaub", cls: "bg-blue-500" },
  { mode: "WISH", label: "Freiwunsch", cls: "bg-cyan-500" },
  { mode: "NONE", label: "Entfernen", cls: "bg-zinc-400" },
];

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const pad = (n: number) => String(n).padStart(2, "0");

function datesInRange(a: string, b: string): string[] {
  let start = a < b ? a : b;
  const end = a < b ? b : a;
  const out: string[] = [];
  let guard = 0;
  while (start <= end && guard++ < 800) {
    out.push(start);
    start = addDays(start, 1);
  }
  return out;
}

export default function CalendarEditor({
  year,
  initialEntries,
  holidays,
  vacationLimit,
}: {
  year: number;
  initialEntries: Record<string, Entry>;
  holidays: Record<string, string>;
  vacationLimit: number;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<Record<string, Entry>>(initialEntries);
  const [mode, setMode] = useState<Mode>("VACATION");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [flash, setFlash] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const vacationUsed = useMemo(
    () => Object.entries(entries).filter(([d, e]) => e.type === "VACATION" && weekday(d) !== 0 && weekday(d) !== 6).length,
    [entries]
  );

  const selection = useMemo(() => {
    if (!anchor) return new Set<string>();
    return new Set(datesInRange(anchor, hover ?? anchor));
  }, [anchor, hover]);

  function clickDay(date: string) {
    if (!anchor) {
      setAnchor(date);
      setHover(date);
      return;
    }
    // zweiter Klick: Zeitraum bestätigen
    const a = anchor;
    setAnchor(null);
    const days = datesInRange(a, date);

    // optimistisch
    setEntries((cur) => {
      const next = { ...cur };
      for (const d of days) {
        if (mode === "NONE") delete next[d];
        else next[d] = { type: mode, status: "PENDING" };
      }
      return next;
    });

    start(async () => {
      const res = await setRange(a, date, mode);
      setFlash(res);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3">
        <span className="text-sm font-medium text-zinc-700">Modus:</span>
        {MODES.map((m) => (
          <button
            key={m.mode}
            onClick={() => { setMode(m.mode); setAnchor(null); }}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              mode === m.mode ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <span className={`inline-block h-3 w-3 rounded-full ${m.cls}`} />
            {m.label}
          </button>
        ))}
        <span className="ml-auto text-sm">
          Urlaub beantragt:{" "}
          <span className={vacationUsed > vacationLimit ? "font-semibold text-red-600" : "font-semibold text-zinc-900"}>
            {vacationUsed} / {vacationLimit}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {anchor ? (
          <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-blue-800">
            Zeitraum-Start: <strong>{anchor}</strong> – jetzt das Enddatum anklicken.
            <button onClick={() => setAnchor(null)} className="ml-2 underline">abbrechen</button>
          </span>
        ) : (
          <span className="text-zinc-500">
            Tag anklicken = Start, zweiter Klick = Ende. Für einen einzelnen Tag denselben Tag zweimal klicken.
          </span>
        )}
        {pending && <span className="text-blue-600">speichert…</span>}
      </div>

      {flash && (
        <div className={`rounded-lg px-3 py-2 text-sm ${flash.level === "error" ? "bg-red-50 text-red-700" : flash.level === "warn" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
          {flash.message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MONTHS.map((name, mIdx) => (
          <Month key={mIdx} year={year} monthIdx={mIdx} name={name} entries={entries} holidays={holidays} selection={selection} onClickDay={clickDay} onHover={setHover} />
        ))}
      </div>

      <Legend />
    </div>
  );
}

function colorFor(type: Kind): string {
  return type === "VACATION" ? "bg-yellow-400" : type === "SPECIAL" ? "bg-blue-500" : "bg-cyan-500";
}

function Month({
  year,
  monthIdx,
  name,
  entries,
  holidays,
  selection,
  onClickDay,
  onHover,
}: {
  year: number;
  monthIdx: number;
  name: string;
  entries: Record<string, Entry>;
  holidays: Record<string, string>;
  selection: Set<string>;
  onClickDay: (date: string) => void;
  onHover: (date: string) => void;
}) {
  const daysInMonth = new Date(Date.UTC(year, monthIdx + 1, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(year, monthIdx, 1)).getUTCDay() + 6) % 7;

  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad(monthIdx + 1)}-${pad(d)}`);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="mb-2 text-sm font-medium text-zinc-800">{name}</div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-zinc-400">
        {WD.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const day = Number(date.slice(8));
          const w = weekday(date);
          const isWeekend = w === 0 || w === 6;
          const isHoliday = holidays[date] != null;
          const entry = entries[date];
          const selected = selection.has(date);

          let cls = "bg-white text-zinc-700 hover:bg-zinc-100";
          let style: React.CSSProperties | undefined;
          if (entry) {
            if (entry.status === "REJECTED") {
              cls = "bg-red-500 text-white";
            } else {
              const base = colorFor(entry.type);
              const txt = entry.type === "VACATION" ? "text-zinc-900" : "text-white";
              if (entry.status === "APPROVED") cls = `${base} ${txt}`;
              else {
                cls = `${base} ${txt} opacity-70`;
                style = { backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,.5) 0 3px, transparent 3px 6px)" };
              }
            }
          } else if (isHoliday) cls = "bg-amber-50 text-amber-700 ring-1 ring-amber-300";
          else if (isWeekend) cls = "bg-zinc-100 text-zinc-400 hover:bg-zinc-200";

          return (
            <button
              key={i}
              onClick={() => onClickDay(date)}
              onMouseEnter={() => onHover(date)}
              title={isHoliday ? holidays[date] : date}
              style={style}
              className={`aspect-square rounded text-xs ${cls} ${selected ? "outline outline-2 outline-blue-600" : ""}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  const items = [
    { cls: "bg-yellow-400", label: "Urlaub" },
    { cls: "bg-blue-500", label: "Sonderurlaub" },
    { cls: "bg-cyan-500", label: "Freiwunsch" },
    { cls: "bg-red-500", label: "abgelehnt" },
    { cls: "bg-amber-50 ring-1 ring-amber-300", label: "Feiertag (NRW)" },
    { cls: "bg-zinc-100", label: "Wochenende" },
  ];
  return (
    <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-3 rounded ${i.cls}`} />
          {i.label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-yellow-400 opacity-70" style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,.5) 0 2px, transparent 2px 4px)" }} />
        ausstehend
      </span>
    </div>
  );
}
