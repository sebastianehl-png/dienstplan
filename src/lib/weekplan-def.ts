// Struktur des Oberarzt-Wochenplans (aus der Blanko-Word-Vorlage übernommen).
// Graue Zellen werden nicht befüllt.

export type RowDef = {
  key: string;
  label: string; // Beschriftung wie in der Vorlage
  skill: string | null; // benötigte Fähigkeit (null = Sonderzeile)
  // Zeile zählt als "kurzer Termin": darf zusätzlich zu einer anderen
  // Tagesaufgabe besetzt werden, ohne als Doppelbelegung zu gelten.
  short?: boolean;
  // Quelle "Jahres-Dienstplan" statt Generator (Rufbereitschaft)
  fromYearPlan?: boolean;
  // Automatisch aus Abwesenheiten der App
  autoAbsences?: boolean;
  grayDays: number[]; // 0=Mo … 4=Fr — graue (nicht zu füllende) Zellen
  // Bis zu N Personen pro Zelle (Standard 1). Nur Platz 1 wird als Lücke gemeldet.
  slots?: number;
};

export const WEEK_ROWS: RowDef[] = [
  { key: "HK1", label: "HK 1 Weyertal", skill: "HK", grayDays: [] },
  { key: "HK2", label: "HK 2 UKK", skill: "HK", grayDays: [] },
  { key: "HK_SENIOR", label: "HK Senior", skill: "HK_SENIOR", grayDays: [] },
  { key: "RUF", label: "Rufbereitschaft", skill: "RUF_VG", fromYearPlan: true, grayDays: [] },
  { key: "FRUEH", label: "Frühbesprechung", skill: "FRUEH", short: true, grayDays: [2] },
  { key: "TAVI", label: "TAVI", skill: "TAVI", grayDays: [] },
  { key: "AV_KLAPPEN", label: "AV-Klappen", skill: "AV_KLAPPEN", grayDays: [0, 2], slots: 2 },
  { key: "BRONCHO", label: "Bronchoskopie", skill: "BRONCHO", grayDays: [] },
  { key: "PNEUMO_AMB", label: "Pneumo. Ambulanz", skill: "PNEUMO_AMB", grayDays: [] },
  { key: "KONSILE", label: "Konsile", skill: "KONSILE", grayDays: [] },
  { key: "ITS_KONSIL", label: "ITS-Konsil", skill: "ITS_KONSIL", grayDays: [] },
  { key: "NORMALSTATION", label: "Normalstation", skill: "NORMALSTATION", grayDays: [], slots: 4 },
  { key: "IMC", label: "IMC", skill: "IMC", grayDays: [], slots: 2 },
  { key: "ITS", label: "ITS", skill: "ITS", grayDays: [] },
  { key: "CPU", label: "CPU", skill: "CPU", grayDays: [] },
  { key: "KARDIO_AMB", label: "Kardio-Ambulanz", skill: "KARDIO_AMB", grayDays: [] },
  { key: "ECHO", label: "Echokardiographie", skill: "ECHO", grayDays: [] },
  { key: "VIDEO", label: "Videokonferenz St. Vinzenz Hosp. 15.00 / Klinikum Lev. 16.00", skill: "VIDEO_VINZENZ", short: true, grayDays: [0, 1, 3, 4] },
  { key: "HERZKONF", label: "Herzkonferenz", skill: "HERZKONFERENZ", short: true, grayDays: [0, 1, 2, 4] },
  { key: "ABWESEND", label: "Abwesenheiten", skill: null, autoAbsences: true, grayDays: [] },
];

export const ROW_BY_KEY = new Map(WEEK_ROWS.map((r) => [r.key, r]));

export const DAY_NAMES = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
