import Holidays from "date-holidays";
import { iso } from "./dates";

// Gesetzliche Feiertage in Nordrhein-Westfalen (NRW) für ein Kalenderjahr.
export function nrwHolidays(year: number): { date: string; name: string }[] {
  const hd = new Holidays("DE", "NW"); // NW = Nordrhein-Westfalen
  const list = hd.getHolidays(year);
  return list
    .filter((h) => h.type === "public")
    .map((h) => ({
      // h.date kommt als "YYYY-MM-DD HH:mm:ss" lokal; auf Kalendertag reduzieren.
      date: iso(new Date(h.date.slice(0, 10) + "T00:00:00Z")),
      name: h.name,
    }));
}
