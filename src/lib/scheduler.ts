// Planungs-Engine (Heuristik): erzeugt einen Jahres-Dienstplan nach den Regeln
// aus Konzept.md. Für sehr enge Fälle ließe sich diese Heuristik später durch
// einen Constraint-Solver (z.B. OR-Tools CP-SAT) ersetzen — die Ein-/Ausgabe
// bliebe gleich.
//
// Regeln (Kurzfassung):
//  - Mo–Do (kein Feiertag): 1 Dienst, Kategorie 1 (Vordergrund + HK).
//  - Wochenende = Block Fr–Sa–So: ein Kat.-1-Arzt macht HK (Fr–So) + Vordergrund Fr.
//    Vordergrund Sa+So: entweder derselbe Kat.-1-Arzt (Solo) ODER ein Kat.-2-Arzt (Split).
//  - Feiertag (Mo–Do): wie ein einzelner Wochenendtag (HK Kat.1 + VG Kat.1/Kat.2).
//  - Nach einem Wochenenddienst ist der folgende Montag dienstfrei.
//  - Abwesenheit (Urlaub/Sonderurlaub) sperrt Dienste hart.
//  - Freiwünsche werden bevorzugt, dürfen aber bei Engpass verletzt werden.
//  - Wochenenden/Monat pro Arzt sind begrenzt (Standard 2), bei Engpass überschreitbar.
//  - Möglichst gleichmäßige Verteilung (getrennt Werktag / Wochenende).

import { addDays, datesOfYear, monthOf, weekday } from "./dates";

export type InputUser = { id: string; name: string; category: number };

export type SchedulerInput = {
  year: number;
  users: InputUser[];
  holidays: Set<string>; // "YYYY-MM-DD"
  absences: Map<string, Set<string>>; // date -> userIds abwesend
  wishes: Map<string, Set<string>>; // date -> userIds mit Freiwunsch
  maxWeekendsPerMonth: number;
  // Reine Vordergrund-Ärzte (Kat. 2): frühestens alle N Wochen wieder ein
  // Wochenend-/Feiertagsdienst. Ist niemand "fällig", übernimmt der
  // Hintergrund-Arzt das Wochenende solo.
  vgWeekendGapWeeks?: number;
};

export type SchedAssignment = { date: string; slot: "WEEKDAY" | "HK" | "VG"; userId: string };

export type Report = {
  uncovered: { date: string; slot: string; reason: string }[];
  wishViolations: { userId: string; name: string; date: string }[];
  weekendCapExceeded: { userId: string; name: string; month: number; count: number }[];
  distribution: {
    userId: string;
    name: string;
    category: number;
    weekdayCount: number;
    weekendUnits: number;
    hkCount: number;
    vgCount: number;
  }[];
};

export type SchedulerResult = { assignments: SchedAssignment[]; report: Report };

type Stat = {
  weekdayCount: number; // Anzahl Werktagsdienste
  weekendUnits: number; // Anzahl Wochenend-/Feiertags-Einsätze (für Balance)
  hkCount: number;
  vgCount: number;
  weekendsByMonth: Map<number, number>;
};

export function generateSchedule(input: SchedulerInput): SchedulerResult {
  const { year, users, holidays, absences, wishes, maxWeekendsPerMonth } = input;
  const vgGapDays = Math.max(0, (input.vgWeekendGapWeeks ?? 6)) * 7;

  const cat1 = users.filter((u) => u.category === 1);

  // Letzter Wochenend-/Feiertagseinsatz der reinen Vordergrund-Ärzte (für den Mindestabstand)
  const lastVgDuty = new Map<string, string>();
  const daysBetween = (a: string, b: string) =>
    Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  const vgDue = (userId: string, date: string) => {
    const last = lastVgDuty.get(userId);
    return !last || daysBetween(last, date) >= vgGapDays;
  };

  const stats = new Map<string, Stat>();
  for (const u of users) {
    stats.set(u.id, { weekdayCount: 0, weekendUnits: 0, hkCount: 0, vgCount: 0, weekendsByMonth: new Map() });
  }

  const assignments: SchedAssignment[] = [];
  const report: Report = { uncovered: [], wishViolations: [], weekendCapExceeded: [], distribution: [] };

  // Belegung: an welchen Tagen ist ein Arzt schon verplant / hat dienstfrei.
  const busy = new Set<string>(); // key "userId|date" -> an diesem Tag nicht verfügbar

  const isAbsent = (userId: string, date: string) => absences.get(date)?.has(userId) ?? false;
  const hasWish = (userId: string, date: string) => wishes.get(date)?.has(userId) ?? false;
  const isBusy = (userId: string, date: string) => busy.has(`${userId}|${date}`);
  const block = (userId: string, date: string) => busy.add(`${userId}|${date}`);

  const available = (userId: string, dates: string[]) =>
    dates.every((d) => !isAbsent(userId, d) && !isBusy(userId, d));

  const wishPenalty = (userId: string, dates: string[]) =>
    dates.reduce((n, d) => n + (hasWish(userId, d) ? 1 : 0), 0);

  const monthCount = (userId: string, m: number) => stats.get(userId)!.weekendsByMonth.get(m) ?? 0;
  const bumpMonth = (userId: string, m: number) => {
    const s = stats.get(userId)!;
    s.weekendsByMonth.set(m, (s.weekendsByMonth.get(m) ?? 0) + 1);
  };

  // Kandidatenauswahl per Score (niedriger = besser). Verfügbarkeit ist hart;
  // Wochenend-Obergrenze und Freiwunsch sind weiche, stark gewichtete Strafen.
  function pick(
    pool: InputUser[],
    dates: string[],
    loadOf: (s: Stat) => number,
    month: number | null
  ): InputUser | null {
    const eligible = pool.filter((u) => available(u.id, dates));
    if (eligible.length === 0) return null;
    let best: InputUser | null = null;
    let bestScore = Infinity;
    for (const u of eligible) {
      const s = stats.get(u.id)!;
      const overCap = month !== null && monthCount(u.id, month) >= maxWeekendsPerMonth ? 1 : 0;
      const score = loadOf(s) * 100 + wishPenalty(u.id, dates) * 10 + overCap * 100000;
      if (score < bestScore) {
        bestScore = score;
        best = u;
      }
    }
    return best;
  }

  // --- Tage/Einheiten des Jahres durchgehen ---
  for (const date of datesOfYear(year)) {
    const w = weekday(date); // 0=So..6=Sa
    const isHol = holidays.has(date);

    if (w === 6) {
      // Samstag => Wochenend-Block Fr–Sa–So
      assignWeekend(date);
    } else if (w === 5 || w === 0) {
      // Freitag/Sonntag: gehören zum Block des benachbarten Samstags -> hier nichts.
      continue;
    } else if (isHol) {
      // Feiertag Mo–Do: einzelner Spezialtag (HK + VG)
      assignSpecialDay(date);
    } else {
      // Werktag Mo–Do
      assignWeekday(date);
    }
  }

  function assignWeekday(date: string) {
    const u = pick(cat1, [date], (s) => s.weekdayCount, null);
    if (!u) {
      report.uncovered.push({ date, slot: "WEEKDAY", reason: "Kein Kat.-1-Arzt verfügbar" });
      return;
    }
    assignments.push({ date, slot: "WEEKDAY", userId: u.id });
    block(u.id, date);
    stats.get(u.id)!.weekdayCount++;
    recordWish(u.id, [date]);
  }

  function assignWeekend(sat: string) {
    const fri = addDays(sat, -1);
    const sun = addDays(sat, 1);
    const mon = addDays(sat, 2);
    const month = monthOf(sat);
    const blockDays = [fri, sat, sun];

    // HK (+ VG Freitag): Kat. 1, muss an allen drei Tagen verfügbar sein.
    const hk = pick(cat1, blockDays, (s) => s.weekendUnits, month);
    if (!hk) {
      report.uncovered.push({ date: `${fri}…${sun}`, slot: "HK", reason: "Kein Kat.-1-Arzt für das Wochenende verfügbar" });
      return;
    }
    // HK an Fr/Sa/So + Vordergrund am Freitag
    for (const d of blockDays) assignments.push({ date: d, slot: "HK", userId: hk.id });
    assignments.push({ date: fri, slot: "VG", userId: hk.id });
    for (const d of blockDays) block(hk.id, d);
    block(hk.id, mon); // Montag frei
    const hs = stats.get(hk.id)!;
    hs.weekendUnits++;
    hs.hkCount++;
    bumpMonth(hk.id, month);
    recordWish(hk.id, blockDays);

    // Vordergrund Sa+So: Kat. 2 nur, wenn der Mindestabstand eingehalten ist
    // (Ziel: reine Vordergrund-Ärzte im Schnitt nur alle N Wochen) – sonst Solo.
    const vgDays = [sat, sun];
    const cat2avail = users.filter((u) => u.category === 2 && vgDue(u.id, fri));
    const vg = pick(cat2avail, vgDays, (s) => s.weekendUnits, month);
    if (vg) {
      lastVgDuty.set(vg.id, fri);
      for (const d of vgDays) assignments.push({ date: d, slot: "VG", userId: vg.id });
      for (const d of vgDays) block(vg.id, d);
      block(vg.id, mon); // Montag frei
      const vs = stats.get(vg.id)!;
      vs.weekendUnits++;
      vs.vgCount++;
      bumpMonth(vg.id, month);
      recordWish(vg.id, vgDays);
    } else {
      // Solo: HK-Arzt übernimmt auch Vordergrund Sa+So
      for (const d of vgDays) assignments.push({ date: d, slot: "VG", userId: hk.id });
      hs.vgCount++;
    }
  }

  function assignSpecialDay(date: string) {
    const mon = weekday(date) === 1; // Feiertag an einem Montag? (selten) – kein Folgetag-frei nötig
    void mon;
    const month = monthOf(date);
    const hk = pick(cat1, [date], (s) => s.weekendUnits, month);
    if (!hk) {
      report.uncovered.push({ date, slot: "HK", reason: "Kein Kat.-1-Arzt für den Feiertag verfügbar" });
      return;
    }
    assignments.push({ date, slot: "HK", userId: hk.id });
    block(hk.id, date);
    const hs = stats.get(hk.id)!;
    hs.weekendUnits++;
    hs.hkCount++;
    bumpMonth(hk.id, month);
    recordWish(hk.id, [date]);

    const vg = pick(users.filter((u) => u.category === 2 && vgDue(u.id, date)), [date], (s) => s.weekendUnits, month);
    if (vg) {
      lastVgDuty.set(vg.id, date);
      assignments.push({ date, slot: "VG", userId: vg.id });
      block(vg.id, date);
      const vs = stats.get(vg.id)!;
      vs.weekendUnits++;
      vs.vgCount++;
      bumpMonth(vg.id, month);
      recordWish(vg.id, [date]);
    } else {
      assignments.push({ date, slot: "VG", userId: hk.id });
      hs.vgCount++;
    }
  }

  function recordWish(userId: string, dates: string[]) {
    for (const d of dates) {
      if (hasWish(userId, d)) {
        const name = users.find((u) => u.id === userId)!.name;
        report.wishViolations.push({ userId, name, date: d });
      }
    }
  }

  // --- Bericht abschließen ---
  for (const u of users) {
    const s = stats.get(u.id)!;
    for (const [m, c] of s.weekendsByMonth) {
      if (c > maxWeekendsPerMonth) {
        report.weekendCapExceeded.push({ userId: u.id, name: u.name, month: m, count: c });
      }
    }
    report.distribution.push({
      userId: u.id,
      name: u.name,
      category: u.category,
      weekdayCount: s.weekdayCount,
      weekendUnits: s.weekendUnits,
      hkCount: s.hkCount,
      vgCount: s.vgCount,
    });
  }
  report.distribution.sort((a, b) => a.category - b.category || a.name.localeCompare(b.name));

  return { assignments, report };
}
