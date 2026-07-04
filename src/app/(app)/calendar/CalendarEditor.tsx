"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setRange, type ActionResult } from "@/lib/actions";
import { addDays, weekday } from "@/lib/dates";

export type CalendarType = { code: string; name: string; short: string; color: string; countsAsVacation: boolean };
type Entry = { type: string; status: string };

const WISH_COLOR = "#06b6d4";
const REJECTED_COLOR = "#ef4444";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const pad = (n: number) => String(n).padStart(2, "0");

// Helle Farben (z.B. Gelb) brauchen dunkle Schrift.
function textOn(color: string): string {
  const hex = color.replace("#", "");
  if (hex.length !== 6) return "#fff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#18181b" : "#ffffff";
}

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
  types,
  colleagues,
}: {
  year: number;
  initialEntries: Record<string, Entry>;
  holidays: Record<string, string>;
  vacationLimit: number;
  types: CalendarType[];
  colleagues: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<Record<string, Entry>>(initialEntries);
  const [mode, setMode] = useState<string>(types[0]?.code ?? "WISH");
  const [substitute, setSubstitute] = useState<string>("");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [flash, setFlash] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  const colorOf = useMemo(() => {
    const m = new Map<string, string>(types.map((t) => [t.code, t.color]));
    m.set("WISH", WISH_COLOR);
    return m;
  }, [types]);

  const vacationCodes = useMemo(() => new Set(types.filter((t) => t.countsAsVacation).map((t) => t.code)), [types]);
  const vacationUsed = useMemo(
    () => Object.entries(entries).filter(([d, e]) => vacationCodes.has(e.type) && weekday(d) !== 0 && weekday(d) !== 6).length,
    [entries, vacationCodes]
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
    const a = anchor;
    setAnchor(null);
    const days = datesInRange(a, date);

    setEntries((cur) => {
      const next = { ...cur };
      for (const d of days) {
        if (mode === "NONE") delete next[d];
        else next[d] = { type: mode, status: "PENDING" };
      }
      return next;
    });

    start(async () => {
      const res = await setRange(a, date, mode, mode !== "WISH" && mode !== "NONE" ? substitute || null : null);
      setFlash(res);
      router.refresh();
    });
  }

  const modeButtons = [
    ...types.map((t) => ({ code: t.code, label: t.name, color: t.color })),
    { code: "WISH", label: "Freiwunsch", color: WISH_COLOR },
    { code: "NONE", label: "Entfernen", color: "#a1a1aa" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3">
        <span className="text-sm font-medium text-zinc-700">Art:</span>
        {modeButtons.map((m) => (
          <button
            key={m.code}
            onClick={() => { setMode(m.code); setAnchor(null); }}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
              mode === m.code ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: m.color }} />
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

      {mode !== "WISH" && mode !== "NONE" && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          <label>Vertretung (optional):</label>
          <select value={substitute} onChange={(e) => setSubstitute(e.target.value)} className="rounded border border-zinc-300 px-2 py-1 text-sm">
            <option value="">– keine –</option>
            {colleagues.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-zinc-400">wird beim nächsten Eintrag mitgespeichert</span>
        </div>
      )}

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
          <Month key={mIdx} year={year} monthIdx={mIdx} name={name} entries={entries} holidays={holidays} selection={selection} colorOf={colorOf} onClickDay={clickDay} onHover={setHover} />
        ))}
      </div>

      <Legend types={types} />
    </div>
  );
}

function Month({
  year,
  monthIdx,
  name,
  entries,
  holidays,
  selection,
  colorOf,
  onClickDay,
  onHover,
}: {
  year: number;
  monthIdx: number;
  name: string;
  entries: Record<string, Entry>;
  holidays: Record<string, string>;
  selection: Set<string>;
  colorOf: Map<string, string>;
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
              style = { backgroundColor: REJECTED_COLOR, color: "#fff" };
              cls = "";
            } else {
              const base = colorOf.get(entry.type) ?? "#64748b";
              style = { backgroundColor: base, color: textOn(base) };
              if (entry.status !== "APPROVED") {
                style.opacity = 0.7;
                style.backgroundImage = "repeating-linear-gradient(45deg, rgba(255,255,255,.5) 0 3px, transparent 3px 6px)";
              }
              cls = "";
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

function Legend({ types }: { types: CalendarType[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
      {types.map((t) => (
        <span key={t.code} className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: t.color }} />
          {t.name} ({t.short})
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: WISH_COLOR }} />
        Freiwunsch (FW)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: REJECTED_COLOR }} />
        abgelehnt
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-amber-50 ring-1 ring-amber-300" />
        Feiertag (NRW)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-zinc-100" />
        Wochenende
      </span>
    </div>
  );
}
