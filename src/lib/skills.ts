// Fester Fähigkeiten-Katalog. Zuordnung zu Personen über UserSkill
// (optional zeitlich begrenzt via validFrom/validTo).

export type SkillDef = {
  code: string;
  label: string;
  forRole: "OBERARZT" | "ASSISTENZARZT";
  // Welche Datumsfelder in der UI angeboten werden:
  dates: "none" | "from" | "fromTo";
};

export const SKILLS: SkillDef[] = [
  // ---- Oberarzt/-ärztin (jeweils optional zeitlich begrenzbar) ----
  { code: "RUF_VG", label: "Rufbereitschaft (Vordergrund)", forRole: "OBERARZT", dates: "fromTo" },
  { code: "RUF_HG", label: "Rufbereitschaft (Hintergrund)", forRole: "OBERARZT", dates: "fromTo" },
  { code: "HK", label: "HK", forRole: "OBERARZT", dates: "fromTo" },
  { code: "HK_SENIOR", label: "HK-Senior", forRole: "OBERARZT", dates: "fromTo" },
  { code: "FRUEH", label: "Frühbesprechung", forRole: "OBERARZT", dates: "fromTo" },
  { code: "TAVI", label: "TAVI", forRole: "OBERARZT", dates: "fromTo" },
  { code: "AV_KLAPPEN", label: "AV-Klappen", forRole: "OBERARZT", dates: "fromTo" },
  { code: "BRONCHO", label: "Bronchoskopie", forRole: "OBERARZT", dates: "fromTo" },
  { code: "PNEUMO_AMB", label: "Pneumologische Ambulanz", forRole: "OBERARZT", dates: "fromTo" },
  { code: "KONSILE", label: "Konsile", forRole: "OBERARZT", dates: "fromTo" },
  { code: "ITS_KONSIL", label: "ITS-Konsile", forRole: "OBERARZT", dates: "fromTo" },
  { code: "NORMALSTATION", label: "Normalstation", forRole: "OBERARZT", dates: "fromTo" },
  { code: "IMC", label: "IMC", forRole: "OBERARZT", dates: "fromTo" },
  { code: "ITS", label: "ITS", forRole: "OBERARZT", dates: "fromTo" },
  { code: "CPU", label: "CPU", forRole: "OBERARZT", dates: "fromTo" },
  { code: "KARDIO_AMB", label: "Kardio-Ambulanz", forRole: "OBERARZT", dates: "fromTo" },
  { code: "ECHO", label: "Echokardiographie", forRole: "OBERARZT", dates: "fromTo" },
  { code: "VIDEO_VINZENZ", label: "Videokonferenz St. Vinzenz", forRole: "OBERARZT", dates: "fromTo" },
  { code: "HERZKONFERENZ", label: "Herzkonferenz", forRole: "OBERARZT", dates: "fromTo" },
  // ---- Assistenzarzt/-ärztin ----
  { code: "VISITE", label: "Visitendienstfähig", forRole: "ASSISTENZARZT", dates: "from" },
  { code: "RUFDIENST", label: "Rufdienstfähig", forRole: "ASSISTENZARZT", dates: "from" },
  { code: "POOL_IMC_CPU_ITS", label: "IMC/CPU/ITS-Pool", forRole: "ASSISTENZARZT", dates: "fromTo" },
];

export const skillLabel = (code: string) => SKILLS.find((s) => s.code === code)?.label ?? code;

// Gilt die Fähigkeit an einem bestimmten Tag?
export function skillValidOn(s: { validFrom: string | null; validTo: string | null }, date: string): boolean {
  if (s.validFrom && date < s.validFrom) return false;
  if (s.validTo && date > s.validTo) return false;
  return true;
}
