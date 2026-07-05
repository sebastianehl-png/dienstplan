// Generator für den Oberarzt-Wochenplan (Mo–Fr) auf Basis von:
//  - Fähigkeiten (UserSkill, zeitlich begrenzt)
//  - freigegebenen Abwesenheiten der App
//  - Standard-Besetzungen je Zeile (RowDefault) – nur bei Abwesenheit ersetzt
//  - Spezialregeln (SpecialRule, z.B. "jeden 2. Mittwoch keine Konsile")
//  - Rufbereitschaft aus dem Jahres-Dienstplan (Fr = Wochenend-Rufdienst)
//  - Fairness über die Historie gespeicherter Wochenpläne

import { prisma } from "./prisma";
import { addDays, formatDE } from "./dates";
import { skillValidOn } from "./skills";
import { WEEK_ROWS } from "./weekplan-def";
import { getTypeMap } from "./absence-types";

export type GeneratedCell = { rowKey: string; day: number; slot: number; userId: string | null; text: string | null };
export type WeekReport = {
  gaps: { rowKey: string; day: number; reason: string }[];
  doubleBookings: { rowKey: string; day: number; userName: string }[];
  defaultsReplaced: { rowKey: string; day: number; defaultName: string; reason: string }[];
};

export type WeekGenResult = { cells: GeneratedCell[]; report: WeekReport };

// Gilt eine Spezialregel an diesem Datum (date = YYYY-MM-DD, day = 0..4)?
function ruleBlocks(
  rule: { rowKey: string | null; weekday: number; interval: string; refDate: string | null; validFrom: string | null; validTo: string | null },
  rowKey: string,
  day: number,
  date: string
): boolean {
  if (rule.rowKey && rule.rowKey !== rowKey) return false;
  if (rule.weekday !== day) return false;
  if (rule.validFrom && date < rule.validFrom) return false;
  if (rule.validTo && date > rule.validTo) return false;
  if (rule.interval === "BIWEEKLY" && rule.refDate) {
    const ms = Date.parse(date + "T00:00:00Z") - Date.parse(rule.refDate + "T00:00:00Z");
    const weeks = Math.round(ms / (7 * 24 * 3600 * 1000));
    return ((weeks % 2) + 2) % 2 === 0;
  }
  return true;
}

export async function generateWeekPlan(weekStart: string): Promise<WeekGenResult> {
  const dates = [0, 1, 2, 3, 4].map((i) => addDays(weekStart, i));
  const year = Number(weekStart.slice(0, 4));

  const [users, absRows, defaults, rules, yearPlan, typeMap] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, jobRole: "OBERARZT" },
      select: { id: true, name: true, skills: true },
    }),
    prisma.absence.findMany({
      where: { status: "APPROVED", date: { in: dates } },
      select: { userId: true, date: true, type: true },
    }),
    prisma.rowDefault.findMany(),
    prisma.specialRule.findMany(),
    prisma.plan.findUnique({ where: { year }, include: { assignments: { where: { date: { in: dates } } } } }),
    getTypeMap(),
  ]);

  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const defaultBySlot = new Map(defaults.filter((d) => d.userId).map((d) => [`${d.rowKey}|${d.slot}`, d.userId!]));

  // Abwesenheit: userId -> Set(dayIndex)
  const absentOn = new Map<string, Set<number>>();
  const absentLabelByDay: string[][] = [[], [], [], [], []];
  for (const a of absRows) {
    const day = dates.indexOf(a.date);
    if (day < 0) continue;
    (absentOn.get(a.userId) ?? absentOn.set(a.userId, new Set()).get(a.userId)!).add(day);
    const nm = nameOf.get(a.userId);
    if (nm) {
      const short = typeMap.get(a.type)?.short ?? "";
      const label = `${nm.split(" ").pop()}${short ? ` (${short})` : ""}`;
      if (!absentLabelByDay[day].includes(label)) absentLabelByDay[day].push(label);
    }
  }

  // Fairness-Historie: bisherige Einsätze je (user,row) aus früheren Wochenplänen dieses Jahres
  const history = await prisma.weekCell.groupBy({
    by: ["rowKey", "userId"],
    where: { userId: { not: null }, plan: { weekStart: { lt: weekStart, gte: `${year}-01-01` } } },
    _count: { _all: true },
  });
  const histCount = new Map<string, number>();
  for (const h of history) if (h.userId) histCount.set(`${h.userId}|${h.rowKey}`, h._count._all);

  // Jahres-Dienstplan: Rufbereitschaft Mo–Do = Tagesdienst, Fr = Wochenend-Rufdienst (HK-Slot am Freitag)
  const rufByDay = new Map<number, string>();
  if (yearPlan) {
    for (const a of yearPlan.assignments) {
      const day = dates.indexOf(a.date);
      if (day < 0) continue;
      if (day <= 3 && a.slot === "WEEKDAY") rufByDay.set(day, a.userId);
      if (day === 4 && a.slot === "HK") rufByDay.set(day, a.userId); // Fr = gleicher wie Wochenende (HK)
    }
  }

  const cells: GeneratedCell[] = [];
  const report: WeekReport = { gaps: [], doubleBookings: [], defaultsReplaced: [] };

  // Tagesbelegung (nur "lange" Zeilen zählen)
  const dayLoad = new Map<string, number>(); // `${userId}|${day}`
  const weekRowCount = new Map<string, number>(); // `${userId}|${rowKey}`
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  const isAbsent = (userId: string, day: number) => absentOn.get(userId)?.has(day) ?? false;
  const isBlocked = (userId: string, rowKey: string, day: number) =>
    rules.some((r) => r.userId === userId && ruleBlocks(r, rowKey, day, dates[day]));
  const hasSkill = (u: (typeof users)[number], skill: string, day: number) =>
    u.skills.some((s) => s.skill === skill && skillValidOn(s, dates[day]));

  function assign(rowKey: string, day: number, slot: number, userId: string | null, text: string | null, short: boolean) {
    cells.push({ rowKey, day, slot, userId, text });
    if (userId) {
      if (!short) bump(dayLoad, `${userId}|${day}`);
      bump(weekRowCount, `${userId}|${rowKey}`);
    }
  }

  for (const row of WEEK_ROWS) {
    for (let day = 0; day < 5; day++) {
      if (row.grayDays.includes(day)) continue;

      // Abwesenheiten-Zeile: automatisch aus der App
      if (row.autoAbsences) {
        assign(row.key, day, 0, null, absentLabelByDay[day].join(", ") || null, true);
        continue;
      }

      // Rufbereitschaft: aus dem Jahres-Dienstplan
      if (row.fromYearPlan) {
        const uid = rufByDay.get(day) ?? null;
        if (uid) assign(row.key, day, 0, uid, null, true);
        else {
          assign(row.key, day, 0, null, null, true);
          report.gaps.push({ rowKey: row.key, day, reason: "Kein (freigegebener) Jahres-Dienstplan für diesen Tag" });
        }
        continue;
      }

      if (!row.skill) continue;

      const slots = row.slots ?? 1;
      const takenInCell = new Set<string>(); // niemand doppelt in derselben Zelle

      for (let slot = 0; slot < slots; slot++) {
        const defId = defaultBySlot.get(`${row.key}|${slot}`);
        // Zusätzliche Plätze (>0) werden nur befüllt, wenn ein Standard-OA gesetzt ist;
        // sonst bleiben sie für manuelle Einträge frei.
        if (slot > 0 && !defId) continue;

        // Kandidaten: Fähigkeit gültig, anwesend, keine Regel-Sperre, noch nicht in dieser Zelle
        const eligible = users.filter(
          (u) => !takenInCell.has(u.id) && hasSkill(u, row.skill!, day) && !isAbsent(u.id, day) && !isBlocked(u.id, row.key, day)
        );

        if (eligible.length === 0) {
          if (slot === 0) {
            assign(row.key, day, slot, null, null, !!row.short);
            const anySkill = users.some((u) => hasSkill(u, row.skill!, day));
            report.gaps.push({
              rowKey: row.key,
              day,
              reason: anySkill ? "Alle geeigneten Personen abwesend/gesperrt" : "Niemand hat diese Fähigkeit",
            });
          } else if (defId) {
            const defUser = users.find((u) => u.id === defId);
            if (defUser) report.defaultsReplaced.push({ rowKey: row.key, day, defaultName: defUser.name, reason: "kein Ersatz verfügbar" });
          }
          continue;
        }

        // Standard-Besetzung hat Vorrang, wenn verfügbar
        if (defId) {
          const def = eligible.find((u) => u.id === defId);
          if (def) {
            assign(row.key, day, slot, def.id, null, !!row.short);
            takenInCell.add(def.id);
            continue;
          }
          const defUser = users.find((u) => u.id === defId);
          if (defUser) {
            report.defaultsReplaced.push({
              rowKey: row.key,
              day,
              defaultName: defUser.name,
              reason: isAbsent(defId, day) ? "abwesend" : isBlocked(defId, row.key, day) ? "Spezialregel" : "Fähigkeit fehlt/abgelaufen",
            });
          }
        }

        // Faire Auswahl: Historie + Woche + Tagesbelegung (Doppelbelegung vermeiden)
        let best: (typeof users)[number] | null = null;
        let bestScore = Infinity;
        for (const u of eligible) {
          const load = row.short ? 0 : dayLoad.get(`${u.id}|${day}`) ?? 0;
          const score =
            (histCount.get(`${u.id}|${row.key}`) ?? 0) * 10 +
            (weekRowCount.get(`${u.id}|${row.key}`) ?? 0) * 100 +
            load * 1000;
          if (score < bestScore) {
            bestScore = score;
            best = u;
          }
        }
        const chosenLoad = row.short ? 0 : dayLoad.get(`${best!.id}|${day}`) ?? 0;
        assign(row.key, day, slot, best!.id, null, !!row.short);
        takenInCell.add(best!.id);
        if (chosenLoad > 0) report.doubleBookings.push({ rowKey: row.key, day, userName: best!.name });
      }
    }
  }

  return { cells, report };
}

// Wochenend-Rufdienst (für die Kopfzeile des Word-Dokuments)
export async function weekendOnCall(weekStart: string): Promise<{ vg: string | null; hk: string | null }> {
  const sat = addDays(weekStart, 5);
  const year = Number(weekStart.slice(0, 4));
  const plan = await prisma.plan.findUnique({
    where: { year },
    include: { assignments: { where: { date: sat }, include: { user: { select: { name: true } } } } },
  });
  if (!plan) return { vg: null, hk: null };
  const vg = plan.assignments.find((a) => a.slot === "VG")?.user.name ?? null;
  const hk = plan.assignments.find((a) => a.slot === "HK")?.user.name ?? null;
  return { vg, hk };
}

export function weekLabel(weekStart: string): string {
  return `${formatDE(weekStart)} – ${formatDE(addDays(weekStart, 4))}`;
}
