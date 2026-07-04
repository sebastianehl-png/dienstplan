import { prisma } from "./prisma";

export type AbsenceTypeInfo = {
  code: string;
  name: string;
  short: string;
  color: string;
  countsAsVacation: boolean;
  countsForLimit: boolean;
  needsApproval: boolean;
  builtin: boolean;
  active: boolean;
  sortOrder: number;
};

// Eingebaute Arten – werden beim ersten Zugriff angelegt, falls sie fehlen
// (macht Migration/Seed robust; bestehende Absence-Zeilen behalten ihre Codes).
const DEFAULTS: Omit<AbsenceTypeInfo, "active">[] = [
  { code: "VACATION", name: "Urlaub", short: "U", color: "#eab308", countsAsVacation: true, countsForLimit: true, needsApproval: true, builtin: true, sortOrder: 1 },
  { code: "SPECIAL", name: "Sonderurlaub", short: "SU", color: "#3b82f6", countsAsVacation: false, countsForLimit: false, needsApproval: true, builtin: true, sortOrder: 2 },
  { code: "SICK", name: "Krankheit", short: "K", color: "#f97316", countsAsVacation: false, countsForLimit: false, needsApproval: false, builtin: true, sortOrder: 3 },
];

export async function ensureDefaultTypes(): Promise<void> {
  for (const t of DEFAULTS) {
    await prisma.absenceType.upsert({ where: { code: t.code }, update: {}, create: { ...t, active: true } });
  }
}

export async function getAbsenceTypes(includeInactive = false): Promise<AbsenceTypeInfo[]> {
  let types = await prisma.absenceType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  if (types.length === 0) {
    await ensureDefaultTypes();
    types = await prisma.absenceType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  }
  return types.filter((t) => includeInactive || t.active);
}

export async function getTypeMap(): Promise<Map<string, AbsenceTypeInfo>> {
  const types = await getAbsenceTypes(true);
  return new Map(types.map((t) => [t.code, t]));
}
