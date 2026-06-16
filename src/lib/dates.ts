// Kalendertage werden als String "YYYY-MM-DD" geführt (keine Uhrzeit/Zeitzone).

export function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parse(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

// 0 = Sonntag, 1 = Montag, ... 6 = Samstag
export function weekday(s: string): number {
  return parse(s).getUTCDay();
}

export function monthOf(s: string): number {
  return parse(s).getUTCMonth() + 1; // 1..12
}

export function isWeekend(s: string): boolean {
  const w = weekday(s);
  return w === 0 || w === 6;
}

// Alle Tage eines Kalenderjahres.
export function datesOfYear(year: number): string[] {
  const out: string[] = [];
  let cur = `${year}-01-01`;
  const end = `${year}-12-31`;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

const WEEKDAY_NAMES = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export function weekdayName(s: string): string {
  return WEEKDAY_NAMES[weekday(s)];
}

export function formatDE(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
}
