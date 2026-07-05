// Gemeinsame Auswertung der Spezialregeln (Wochenplan-Generator + Bearbeitungs-UI).

export type RuleLike = {
  userId: string;
  rowKey: string | null;
  weekday: number | null; // null = alle Tage
  interval: string; // EVERY | BIWEEKLY
  refDate: string | null;
  validFrom: string | null;
  validTo: string | null;
};

// Tage seit Epoche des Montags der Woche von `date` (für stabile 2-Wochen-Rhythmen).
function mondayOf(date: string): number {
  const t = Date.parse(date + "T00:00:00Z") / 86400000;
  const dow = (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7; // 0 = Montag
  return t - dow;
}

// Sperrt die Regel diese Person für rowKey am Tag `date` (day = 0..4)?
export function ruleBlocks(rule: RuleLike, rowKey: string, day: number, date: string): boolean {
  if (rule.rowKey && rule.rowKey !== rowKey) return false;
  if (rule.weekday != null && rule.weekday !== day) return false;
  if (rule.validFrom && date < rule.validFrom) return false;
  if (rule.validTo && date > rule.validTo) return false;
  if (rule.interval === "BIWEEKLY" && rule.refDate) {
    const weeks = Math.round((mondayOf(date) - mondayOf(rule.refDate)) / 7);
    return ((weeks % 2) + 2) % 2 === 0;
  }
  return true;
}

export function blockedByAnyRule(rules: RuleLike[], userId: string, rowKey: string, day: number, date: string): boolean {
  return rules.some((r) => r.userId === userId && ruleBlocks(r, rowKey, day, date));
}
