"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "./prisma";
import {
  createSession,
  destroySession,
  hashPassword,
  isStaff,
  requireAdmin,
  requireStaff,
  requireUser,
  verifyPassword,
} from "./auth";
import { generateSchedule, type SchedulerInput } from "./scheduler";
import { nrwHolidays } from "./holidays";
import { addDays, formatDE, weekday } from "./dates";
import { getAbsenceTypes, getTypeMap } from "./absence-types";
import { SKILLS } from "./skills";
import { generateWeekPlan, type WeekReport } from "./weekplan";
import { ROW_BY_KEY } from "./weekplan-def";

export type ActionResult = { level: "ok" | "warn" | "error"; message: string };

// ============================ Authentifizierung ============================
export async function signIn(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { level: "error", message: "Bitte E-Mail und Passwort eingeben." };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    return { level: "error", message: "E-Mail oder Passwort ist falsch." };
  }
  await createSession(user.id);
  redirect("/dashboard");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

// Passwort ändern (eingeloggt)
export async function changePassword(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next.length < 6) return { level: "error", message: "Neues Passwort muss mindestens 6 Zeichen haben." };
  if (next !== confirm) return { level: "error", message: "Die neuen Passwörter stimmen nicht überein." };
  if (!(await verifyPassword(current, user.passwordHash))) return { level: "error", message: "Aktuelles Passwort ist falsch." };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } });
  return { level: "ok", message: "Passwort geändert." };
}

// Passwort vergessen: Token erzeugen. Im Prototyp wird der Link zurückgegeben
// (statt per E-Mail versendet). Aus Datenschutzgründen immer generische Meldung.
export async function requestPasswordReset(_prev: unknown, formData: FormData): Promise<ActionResult & { resetUrl?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const generic: ActionResult = {
    level: "ok",
    message: "Falls die E-Mail bekannt ist, wurde ein Link zum Zurücksetzen erstellt.",
  };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return generic;

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 1000 * 60 * 60) }, // 1h
  });
  // TODO Cloud: hier stattdessen E-Mail mit diesem Link versenden.
  return { ...generic, resetUrl: `/reset?token=${token}` };
}

export async function resetPassword(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next.length < 6) return { level: "error", message: "Passwort muss mindestens 6 Zeichen haben." };
  if (next !== confirm) return { level: "error", message: "Die Passwörter stimmen nicht überein." };

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    return { level: "error", message: "Der Link ist ungültig oder abgelaufen." };
  }
  await prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(next) } });
  await prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return { level: "ok", message: "Passwort gesetzt. Du kannst dich jetzt anmelden." };
}

// ============================ Settings-Helfer ============================
async function getSettings() {
  return (
    (await prisma.settings.findUnique({ where: { id: 1 } })) ?? {
      id: 1,
      maxConcurrentAbsent: 5,
      vacationDaysPerYear: 30,
      maxWeekendsPerMonth: 2,
    }
  );
}

export async function getVacationLimit(userId: string, year: number): Promise<number> {
  const settings = await getSettings();
  const carry = await prisma.carryover.findUnique({ where: { userId_year: { userId, year } } });
  return settings.vacationDaysPerYear + (carry?.days ?? 0);
}

// Genehmigte Urlaubs-Werktage (Mo–Fr) im Jahr – alle Arten, die ins Konto zählen.
export async function countVacationWeekdays(userId: string, year: number): Promise<number> {
  const vacationCodes = (await getAbsenceTypes(true)).filter((t) => t.countsAsVacation).map((t) => t.code);
  const rows = await prisma.absence.findMany({
    where: { userId, type: { in: vacationCodes }, status: "APPROVED", date: { startsWith: String(year) } },
    select: { date: true },
  });
  return rows.filter((r) => weekday(r.date) !== 0 && weekday(r.date) !== 6).length;
}

// ============================ Helfer für Anträge (Gruppen) ============================
function eachDate(start: string, end: string): string[] {
  if (end < start) [start, end] = [end, start];
  const out: string[] = [];
  let cur = start;
  let guard = 0;
  while (cur <= end && guard++ < 800) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

async function rangeLabel(start: string, end: string, kind: string): Promise<string> {
  const t = kind === "WISH" ? "Freiwunsch" : (await getTypeMap()).get(kind)?.name ?? kind;
  return start === end ? `${formatDE(start)} · ${t}` : `${formatDE(start)}–${formatDE(end)} · ${t}`;
}

async function checkConcurrency(date: string, exceptUserId: string): Promise<boolean> {
  const settings = await getSettings();
  const limitCodes = (await getAbsenceTypes(true)).filter((t) => t.countsForLimit).map((t) => t.code);
  const c = await prisma.absence.count({
    where: { date, type: { in: limitCodes }, status: "APPROVED", userId: { not: exceptUserId } },
  });
  return c < settings.maxConcurrentAbsent;
}

// Schreibt einen Antrag (mehrere Tage) für einen Nutzer; ersetzt vorhandene Tage.
async function writeRange(opts: {
  userId: string;
  start: string;
  end: string;
  kind: string; // "WISH" oder Code einer AbsenceType
  status: "PENDING" | "APPROVED";
  approvedById?: string | null;
  groupId?: string;
  substituteId?: string | null;
}): Promise<string> {
  const dates = eachDate(opts.start, opts.end);
  const groupId = opts.groupId ?? crypto.randomUUID();
  const approvedAt = opts.status === "APPROVED" ? new Date() : null;
  for (const date of dates) {
    await prisma.absence.deleteMany({ where: { userId: opts.userId, date } });
    await prisma.wish.deleteMany({ where: { userId: opts.userId, date } });
    if (opts.kind === "WISH") {
      await prisma.wish.create({ data: { userId: opts.userId, date, status: opts.status, groupId, approvedAt, approvedById: opts.approvedById ?? null } });
    } else {
      await prisma.absence.create({
        data: {
          userId: opts.userId,
          date,
          type: opts.kind,
          status: opts.status,
          groupId,
          approvedAt,
          approvedById: opts.approvedById ?? null,
          substituteId: opts.substituteId ?? null,
        },
      });
    }
  }
  return groupId;
}

// ============================ Eigene Kalendereinträge (Bereich) ============================
// Trägt einen zusammenhängenden Zeitraum als EINEN Antrag ein.
// Arten mit needsApproval=false (z.B. Krankheit) sind sofort wirksam.
export async function setRange(start: string, end: string, kind: string, substituteId?: string | null): Promise<ActionResult> {
  const user = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { level: "error", message: "Ungültiges Datum." };

  if (kind === "NONE") {
    for (const date of eachDate(start, end)) {
      await prisma.absence.deleteMany({ where: { userId: user.id, date } });
      await prisma.wish.deleteMany({ where: { userId: user.id, date } });
    }
    revalidateAll();
    return { level: "ok", message: "Einträge entfernt." };
  }

  let needsApproval = true;
  if (kind !== "WISH") {
    const type = (await getTypeMap()).get(kind);
    if (!type || !type.active) return { level: "error", message: "Unbekannte Abwesenheitsart." };
    needsApproval = type.needsApproval;
  }

  const status = needsApproval ? "PENDING" : "APPROVED";
  const groupId = await writeRange({ userId: user.id, start, end, kind, status, substituteId: substituteId ?? null });
  await prisma.leaveLog.create({ data: { groupId, action: "CREATED", byUserId: user.id, detail: await rangeLabel(start, end, kind) } });
  if (!needsApproval) {
    await prisma.leaveLog.create({ data: { groupId, action: "APPROVED", byUserId: user.id, detail: "automatisch (keine Freigabe nötig)" } });
  }
  revalidateAll();
  const n = eachDate(start, end).length;
  return {
    level: "ok",
    message: needsApproval ? `Antrag über ${n} Tag(e) gespeichert – wartet auf Freigabe.` : `Eintrag über ${n} Tag(e) gespeichert (sofort wirksam).`,
  };
}

// Vertretung eines Antrags setzen/ändern (Owner solange ausstehend, Staff immer).
export async function setSubstitute(groupId: string, substituteId: string | null): Promise<ActionResult> {
  const actor = await requireUser();
  const first = await prisma.absence.findFirst({ where: { groupId } });
  if (!first) return { level: "error", message: "Antrag nicht gefunden." };
  const staff = isStaff(actor.role);
  if (!staff && !(first.userId === actor.id && first.status === "PENDING")) {
    return { level: "error", message: "Keine Berechtigung." };
  }
  if (substituteId === first.userId) return { level: "error", message: "Man kann sich nicht selbst vertreten." };
  await prisma.absence.updateMany({ where: { groupId }, data: { substituteId } });
  revalidateAll();
  return { level: "ok", message: substituteId ? "Vertretung gespeichert." : "Vertretung entfernt." };
}

// ============================ Freigabe / Bearbeitung durch Staff ============================
export async function approveGroup(groupId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  const absRows = await prisma.absence.findMany({ where: { groupId } });
  const wishRows = await prisma.wish.findMany({ where: { groupId } });
  if (absRows.length === 0 && wishRows.length === 0) return { level: "error", message: "Antrag nicht gefunden." };

  // FCFS-Prüfung für Tage, deren Art ins Abwesenheits-Limit zählt
  const limitCodes = new Set((await getAbsenceTypes(true)).filter((t) => t.countsForLimit).map((t) => t.code));
  for (const a of absRows) {
    if (a.status === "APPROVED") continue;
    if (limitCodes.has(a.type) && !(await checkConcurrency(a.date, a.userId))) {
      return { level: "error", message: `Freigabe nicht möglich: am ${formatDE(a.date)} ist bereits das Maximum abwesend.` };
    }
  }
  const now = new Date();
  await prisma.absence.updateMany({ where: { groupId }, data: { status: "APPROVED", approvedAt: now, approvedById: actor.id } });
  await prisma.wish.updateMany({ where: { groupId }, data: { status: "APPROVED", approvedAt: now, approvedById: actor.id } });
  await prisma.leaveLog.create({ data: { groupId, action: "APPROVED", byUserId: actor.id } });
  revalidateAll();
  return { level: "ok", message: "Antrag freigegeben." };
}

export async function rejectGroup(groupId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  // Nicht löschen, sondern als abgelehnt markieren (bleibt rot sichtbar).
  await prisma.absence.updateMany({ where: { groupId }, data: { status: "REJECTED", approvedAt: null, approvedById: null } });
  await prisma.wish.updateMany({ where: { groupId }, data: { status: "REJECTED", approvedAt: null, approvedById: null } });
  await prisma.leaveLog.create({ data: { groupId, action: "REJECTED", byUserId: actor.id } });
  revalidateAll();
  return { level: "ok", message: "Antrag abgelehnt." };
}

export async function approveAllPending(): Promise<ActionResult> {
  await requireStaff();
  const absGroups = (await prisma.absence.findMany({ where: { status: "PENDING" }, select: { groupId: true } })).map((r) => r.groupId);
  const wishGroups = (await prisma.wish.findMany({ where: { status: "PENDING" }, select: { groupId: true } })).map((r) => r.groupId);
  const groups = Array.from(new Set([...absGroups, ...wishGroups])).filter(Boolean);
  let approved = 0;
  let blocked = 0;
  for (const g of groups) {
    const res = await approveGroup(g);
    if (res.level === "error") blocked++;
    else approved++;
  }
  revalidateAll();
  return {
    level: blocked > 0 ? "warn" : "ok",
    message: `${approved} Antrag/Anträge freigegeben${blocked > 0 ? `, ${blocked} wegen Maximum übersprungen` : ""}.`,
  };
}

// Antrag bearbeiten: behält die ursprüngliche groupId & das CREATED-Protokoll,
// ergänzt einen MODIFIED-Eintrag. Owner (nur solange ausstehend) oder Staff.
export async function editGroup(groupId: string, start: string, end: string, kind: string): Promise<ActionResult> {
  const actor = await requireUser();
  const firstAbs = await prisma.absence.findFirst({ where: { groupId } });
  const first = firstAbs ?? (await prisma.wish.findFirst({ where: { groupId } }));
  if (!first) return { level: "error", message: "Antrag nicht gefunden." };

  const staff = isStaff(actor.role);
  const isOwner = first.userId === actor.id;
  if (!staff && !(isOwner && first.status === "PENDING")) {
    return { level: "error", message: "Bearbeiten nicht möglich (nur eigene, noch nicht freigegebene Anträge)." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { level: "error", message: "Ungültiges Datum." };
  if (kind !== "WISH" && !(await getTypeMap()).get(kind)) return { level: "error", message: "Unbekannte Abwesenheitsart." };

  // Alte Tage des Antrags entfernen, neue mit gleicher groupId anlegen.
  await prisma.absence.deleteMany({ where: { groupId } });
  await prisma.wish.deleteMany({ where: { groupId } });
  // Staff-Bearbeitung gilt als freigegeben, Owner-Bearbeitung muss neu freigegeben werden.
  const status = staff ? "APPROVED" : "PENDING";
  await writeRange({
    userId: first.userId,
    start,
    end,
    kind,
    status,
    approvedById: staff ? actor.id : null,
    groupId,
    substituteId: firstAbs?.substituteId ?? null,
  });
  await prisma.leaveLog.create({
    data: { groupId, action: "MODIFIED", byUserId: actor.id, detail: await rangeLabel(start, end, kind) },
  });
  revalidateAll();
  return { level: "ok", message: "Antrag geändert (ursprüngliches Eintragsdatum bleibt erhalten)." };
}

// ============================ Abwesenheitsarten (Staff) ============================
export async function saveAbsenceType(_prev: unknown, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const short = String(formData.get("short") ?? "").trim().toUpperCase().slice(0, 3);
  const color = String(formData.get("color") ?? "#64748b");
  const countsAsVacation = formData.get("countsAsVacation") === "on";
  const countsForLimit = formData.get("countsForLimit") === "on";
  const needsApproval = formData.get("needsApproval") === "on";
  if (!name || !short) return { level: "error", message: "Name und Kürzel sind Pflicht." };

  if (id) {
    await prisma.absenceType.update({ where: { id }, data: { name, short, color, countsAsVacation, countsForLimit, needsApproval } });
    revalidatePath("/admin/absence-types");
    return { level: "ok", message: `„${name}" gespeichert.` };
  }
  const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 24);
  if (await prisma.absenceType.findUnique({ where: { code } })) return { level: "error", message: "Eine Art mit diesem Namen existiert bereits." };
  await prisma.absenceType.create({
    data: { code, name, short, color, countsAsVacation, countsForLimit, needsApproval, sortOrder: 50 },
  });
  revalidatePath("/admin/absence-types");
  return { level: "ok", message: `Abwesenheitsart „${name}" angelegt.` };
}

export async function toggleAbsenceType(id: string): Promise<ActionResult> {
  await requireStaff();
  const t = await prisma.absenceType.findUnique({ where: { id } });
  if (!t) return { level: "error", message: "Art nicht gefunden." };
  await prisma.absenceType.update({ where: { id }, data: { active: !t.active } });
  revalidatePath("/admin/absence-types");
  return { level: "ok", message: t.active ? `„${t.name}" deaktiviert.` : `„${t.name}" aktiviert.` };
}

export async function deleteAbsenceType(id: string): Promise<ActionResult> {
  await requireStaff();
  const t = await prisma.absenceType.findUnique({ where: { id } });
  if (!t) return { level: "error", message: "Art nicht gefunden." };
  if (t.builtin) return { level: "error", message: "Eingebaute Arten können nur deaktiviert werden." };
  const inUse = await prisma.absence.count({ where: { type: t.code } });
  if (inUse > 0) return { level: "error", message: `„${t.name}" wird von ${inUse} Eintrag/Einträgen genutzt – bitte nur deaktivieren.` };
  await prisma.absenceType.delete({ where: { id } });
  revalidatePath("/admin/absence-types");
  return { level: "ok", message: `„${t.name}" gelöscht.` };
}

// ============================ Personalakte ============================
export async function updatePersonnel(_prev: unknown, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { level: "error", message: "Nutzer fehlt." };
  const s = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };
  const weeklyRaw = String(formData.get("weeklyHours") ?? "").trim().replace(",", ".");
  const weeklyHours = weeklyRaw === "" ? null : Number(weeklyRaw);
  if (weeklyHours !== null && (!Number.isFinite(weeklyHours) || weeklyHours < 0 || weeklyHours > 80)) {
    return { level: "error", message: "Wochenstunden bitte als Zahl zwischen 0 und 80 angeben." };
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      position: s("position"),
      phone: s("phone"),
      address: s("address"),
      birthDate: s("birthDate"),
      hireDate: s("hireDate"),
      emergency: s("emergency"),
      staffNotes: s("staffNotes"),
      weeklyHours,
    },
  });
  revalidatePath("/admin/personnel");
  revalidatePath("/profile");
  return { level: "ok", message: "Personalakte gespeichert." };
}

// ============================ Kommentare (am Antrag) ============================
export async function addComment(groupId: string, text: string): Promise<ActionResult> {
  const user = await requireUser();
  const clean = text.trim();
  if (!clean) return { level: "error", message: "Kommentar ist leer." };

  if (!isStaff(user.role)) {
    const owner = (await prisma.absence.findFirst({ where: { groupId }, select: { userId: true } })) ?? (await prisma.wish.findFirst({ where: { groupId }, select: { userId: true } }));
    if (!owner || owner.userId !== user.id) return { level: "error", message: "Keine Berechtigung." };
  }
  await prisma.comment.create({ data: { text: clean, authorId: user.id, groupId } });
  revalidateAll();
  return { level: "ok", message: "Kommentar gespeichert." };
}

export async function deleteComment(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const c = await prisma.comment.findUnique({ where: { id } });
  if (!c) return { level: "error", message: "Kommentar nicht gefunden." };
  if (c.authorId !== user.id && !isStaff(user.role)) return { level: "error", message: "Keine Berechtigung." };
  await prisma.comment.delete({ where: { id } });
  revalidateAll();
  return { level: "ok", message: "Kommentar gelöscht." };
}

// ============================ Resturlaub-Übertrag ============================
export async function setCarryover(userId: string, year: number, days: number): Promise<ActionResult> {
  await requireStaff();
  if (!userId || !Number.isInteger(year) || !Number.isFinite(days) || days < 0) {
    return { level: "error", message: "Bitte gültige Werte eingeben." };
  }
  await prisma.carryover.upsert({
    where: { userId_year: { userId, year } },
    update: { days },
    create: { userId, year, days },
  });
  revalidatePath("/admin/carryover");
  revalidatePath("/dashboard");
  return { level: "ok", message: "Resturlaub übertragen." };
}

// ============================ Gruppen ============================
export async function createGroup(_prev: unknown, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { level: "error", message: "Bitte einen Gruppennamen eingeben." };
  if (await prisma.group.findUnique({ where: { name } })) return { level: "error", message: "Gruppe existiert bereits." };
  await prisma.group.create({ data: { name } });
  revalidatePath("/admin/groups");
  return { level: "ok", message: `Gruppe „${name}" angelegt.` };
}

export async function deleteGroup(id: string): Promise<ActionResult> {
  await requireStaff();
  await prisma.group.delete({ where: { id } });
  revalidatePath("/admin/groups");
  return { level: "ok", message: "Gruppe gelöscht." };
}

export async function setUserGroups(userId: string, groupIds: string[]): Promise<ActionResult> {
  await requireStaff();
  await prisma.userGroup.deleteMany({ where: { userId } });
  if (groupIds.length > 0) {
    await prisma.userGroup.createMany({ data: groupIds.map((groupId) => ({ userId, groupId })) });
  }
  revalidatePath("/admin/groups");
  revalidatePath("/matrix");
  return { level: "ok", message: "Gruppenzuordnung gespeichert." };
}

// ============================ Nutzerverwaltung ============================
export async function createUser(_prev: unknown, formData: FormData): Promise<ActionResult> {
  const actor = await requireStaff();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  let jobRole = String(formData.get("jobRole") ?? "OBERARZT");
  let role = String(formData.get("role") ?? "DOCTOR");
  const password = String(formData.get("password") ?? "");
  if (!name || !email || password.length < 4) {
    return { level: "error", message: "Bitte alle Felder korrekt ausfüllen (Passwort ≥ 4 Zeichen)." };
  }
  if (!["OBERARZT", "ASSISTENZARZT", "VERWALTUNG"].includes(jobRole)) jobRole = "OBERARZT";
  if (!["DOCTOR", "SUBADMIN", "ADMIN"].includes(role)) role = "DOCTOR";
  if (role === "ADMIN" && actor.role !== "ADMIN") {
    return { level: "error", message: "Nur Voll-Admins dürfen Admin-Rechte vergeben." };
  }
  if (await prisma.user.findUnique({ where: { email } })) return { level: "error", message: "Diese E-Mail ist bereits vergeben." };
  // category ist nur noch ein Altlast-Feld; die Rufdienst-Eignung kommt aus den Fähigkeiten.
  await prisma.user.create({ data: { name, email, category: 1, jobRole, role, passwordHash: await hashPassword(password) } });
  revalidatePath("/admin/users");
  return { level: "ok", message: `${name} angelegt – Fähigkeiten bitte unter Personal pflegen.` };
}

export async function updateUserRole(userId: string, role: "DOCTOR" | "SUBADMIN" | "ADMIN"): Promise<ActionResult> {
  const actor = await requireStaff();
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { level: "error", message: "Nutzer nicht gefunden." };
  // Nur Voll-Admins dürfen ADMIN vergeben/entziehen.
  if ((role === "ADMIN" || target.role === "ADMIN") && actor.role !== "ADMIN") {
    return { level: "error", message: "Nur Voll-Admins dürfen Admin-Rechte ändern." };
  }
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/users");
  return { level: "ok", message: "Rolle aktualisiert." };
}

export async function toggleUserActive(userId: string) {
  await requireStaff();
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (u) await prisma.user.update({ where: { id: userId }, data: { active: !u.active } });
  revalidatePath("/admin/users");
}

// ============================ Funktion & Fähigkeiten ============================
export async function updateJobRole(userId: string, jobRole: "OBERARZT" | "ASSISTENZARZT" | "VERWALTUNG"): Promise<ActionResult> {
  await requireStaff();
  if (!["OBERARZT", "ASSISTENZARZT", "VERWALTUNG"].includes(jobRole)) return { level: "error", message: "Ungültige Funktion." };
  await prisma.user.update({ where: { id: userId }, data: { jobRole } });
  revalidatePath("/admin/personnel");
  return { level: "ok", message: "Funktion aktualisiert." };
}

// Ersetzt die Fähigkeiten eines Mitarbeiters komplett (Checkboxen-Formular).
export async function updateSkills(
  userId: string,
  entries: { skill: string; validFrom: string | null; validTo: string | null }[]
): Promise<ActionResult> {
  await requireStaff();
  const known = new Set(SKILLS.map((s) => s.code));
  for (const e of entries) if (!known.has(e.skill)) return { level: "error", message: `Unbekannte Fähigkeit: ${e.skill}` };
  await prisma.userSkill.deleteMany({ where: { userId } });
  if (entries.length > 0) {
    await prisma.userSkill.createMany({
      data: entries.map((e) => ({ userId, skill: e.skill, validFrom: e.validFrom, validTo: e.validTo })),
    });
  }
  revalidatePath("/admin/personnel");
  return { level: "ok", message: "Fähigkeiten gespeichert." };
}

// ============================ Wochenplan: Standard-OAs & Spezialregeln ============================
export async function setRowDefault(rowKey: string, slot: number, userId: string | null): Promise<ActionResult> {
  await requireStaff();
  const row = ROW_BY_KEY.get(rowKey);
  if (!row) return { level: "error", message: "Unbekannte Zeile." };
  if (!Number.isInteger(slot) || slot < 0 || slot >= (row.slots ?? 1)) return { level: "error", message: "Ungültiger Platz." };
  await prisma.rowDefault.upsert({
    where: { rowKey_slot: { rowKey, slot } },
    update: { userId },
    create: { rowKey, slot, userId },
  });
  revalidatePath("/admin/weekplan-settings");
  return { level: "ok", message: "Standard-Besetzung gespeichert." };
}

export async function createSpecialRule(_prev: unknown, formData: FormData): Promise<ActionResult> {
  await requireStaff();
  const userId = String(formData.get("userId") ?? "");
  const rowKeyRaw = String(formData.get("rowKey") ?? "");
  const weekday_ = Number(formData.get("weekday"));
  const interval = String(formData.get("interval") ?? "EVERY");
  const refDate = String(formData.get("refDate") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!userId || !Number.isInteger(weekday_) || weekday_ < 0 || weekday_ > 4) {
    return { level: "error", message: "Bitte Person und Wochentag angeben." };
  }
  if (interval === "BIWEEKLY" && !refDate) {
    return { level: "error", message: "Für „jede 2. Woche“ bitte ein Referenzdatum angeben (ein betroffener Tag)." };
  }
  await prisma.specialRule.create({
    data: { userId, rowKey: rowKeyRaw || null, weekday: weekday_, interval: interval === "BIWEEKLY" ? "BIWEEKLY" : "EVERY", refDate, note },
  });
  revalidatePath("/admin/weekplan-settings");
  return { level: "ok", message: "Regel angelegt." };
}

export async function deleteSpecialRule(id: string): Promise<ActionResult> {
  await requireStaff();
  await prisma.specialRule.delete({ where: { id } });
  revalidatePath("/admin/weekplan-settings");
  return { level: "ok", message: "Regel gelöscht." };
}

// ============================ Wochenplan erzeugen/bearbeiten ============================
export async function generateWeek(weekStart: string): Promise<ActionResult & { report?: WeekReport }> {
  await requireStaff();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || weekday(weekStart) !== 1) {
    return { level: "error", message: "Bitte einen Montag als Wochenstart wählen." };
  }
  const { cells, report } = await generateWeekPlan(weekStart);
  await prisma.weekPlan.deleteMany({ where: { weekStart } });
  const plan = await prisma.weekPlan.create({ data: { weekStart, status: "DRAFT" } });
  await prisma.weekCell.createMany({
    data: cells.map((c) => ({ planId: plan.id, rowKey: c.rowKey, day: c.day, slot: c.slot, userId: c.userId, text: c.text })),
  });
  revalidatePath("/admin/weekplan");
  revalidatePath("/weekplan");
  const gaps = report.gaps.length;
  return {
    level: gaps > 0 ? "warn" : "ok",
    message: gaps > 0 ? `Entwurf erstellt – ${gaps} unbesetzte Zelle(n).` : "Entwurf erstellt – alle Zellen besetzt.",
    report,
  };
}

export async function updateWeekCell(
  weekStart: string,
  rowKey: string,
  day: number,
  slot: number,
  userId: string | null,
  text: string | null
): Promise<ActionResult> {
  await requireStaff();
  const plan = await prisma.weekPlan.findUnique({ where: { weekStart } });
  if (!plan) return { level: "error", message: "Kein Wochenplan vorhanden." };
  await prisma.weekCell.upsert({
    where: { planId_rowKey_day_slot: { planId: plan.id, rowKey, day, slot } },
    update: { userId, text },
    create: { planId: plan.id, rowKey, day, slot, userId, text },
  });
  revalidatePath("/admin/weekplan");
  revalidatePath("/weekplan");
  return { level: "ok", message: "Zelle gespeichert." };
}

export async function publishWeek(weekStart: string): Promise<ActionResult> {
  await requireStaff();
  await prisma.weekPlan.update({ where: { weekStart }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  revalidatePath("/admin/weekplan");
  revalidatePath("/weekplan");
  return { level: "ok", message: "Wochenplan veröffentlicht – für alle sichtbar." };
}

export async function deleteWeek(weekStart: string): Promise<ActionResult> {
  await requireStaff();
  await prisma.weekPlan.deleteMany({ where: { weekStart } });
  revalidatePath("/admin/weekplan");
  revalidatePath("/weekplan");
  return { level: "ok", message: "Wochenplan verworfen." };
}

// ============================ Einstellungen (nur Admin) ============================
export async function updateSettings(_prev: unknown, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const maxConcurrentAbsent = Number(formData.get("maxConcurrentAbsent"));
  const vacationDaysPerYear = Number(formData.get("vacationDaysPerYear"));
  const maxWeekendsPerMonth = Number(formData.get("maxWeekendsPerMonth"));
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { maxConcurrentAbsent, vacationDaysPerYear, maxWeekendsPerMonth },
    create: { id: 1, maxConcurrentAbsent, vacationDaysPerYear, maxWeekendsPerMonth },
  });
  revalidatePath("/admin/settings");
  return { level: "ok", message: "Einstellungen gespeichert." };
}

// ============================ Planerstellung (Staff) ============================
// Rufdienst-Eignung aus den Fähigkeiten ableiten (statt fester Kategorie):
//  Rufbereitschaft (Hintergrund) => wie frühere Kat. 1 (Werktag + HK am Wochenende)
//  nur Rufbereitschaft (Vordergrund) => wie frühere Kat. 2 (Wochenend-Vordergrund)
//  keine Ruf-Fähigkeit => wird nicht eingeplant
function rufCategory(skills: { skill: string; validFrom: string | null; validTo: string | null }[], year: number): 1 | 2 | null {
  const overlapsYear = (s: { validFrom: string | null; validTo: string | null }) =>
    (!s.validFrom || s.validFrom <= `${year}-12-31`) && (!s.validTo || s.validTo >= `${year}-01-01`);
  const has = (code: string) => skills.some((s) => s.skill === code && overlapsYear(s));
  if (has("RUF_HG")) return 1;
  if (has("RUF_VG")) return 2;
  return null;
}

export async function generatePlan(year: number): Promise<ActionResult> {
  await requireStaff();
  const settings = await getSettings();
  // Nur Oberärzte mit Rufdienst-Fähigkeit werden im Jahresplan eingeteilt.
  const allOAs = await prisma.user.findMany({
    where: { active: true, jobRole: "OBERARZT" },
    select: { id: true, name: true, skills: { select: { skill: true, validFrom: true, validTo: true } } },
  });
  const users: { id: string; name: string; category: number }[] = [];
  const excluded: string[] = [];
  for (const u of allOAs) {
    const cat = rufCategory(u.skills, year);
    if (cat) users.push({ id: u.id, name: u.name, category: cat });
    else excluded.push(u.name);
  }
  if (users.filter((u) => u.category === 1).length === 0) {
    return {
      level: "error",
      message:
        "Kein Oberarzt hat die Fähigkeit „Rufbereitschaft (Hintergrund)“ – bitte zuerst unter Personal die Fähigkeiten pflegen.",
    };
  }

  let holidays = await prisma.holiday.findMany({ where: { year } });
  if (holidays.length === 0) {
    for (const h of nrwHolidays(year)) {
      await prisma.holiday.upsert({ where: { date: h.date }, update: { name: h.name, year }, create: { date: h.date, name: h.name, year } });
    }
    holidays = await prisma.holiday.findMany({ where: { year } });
  }

  const yearPrefix = String(year);
  // Nur FREIGEGEBENE Einträge wirken sich auf den Plan aus.
  const absRows = await prisma.absence.findMany({ where: { status: "APPROVED", date: { startsWith: yearPrefix } }, select: { userId: true, date: true } });
  const wishRows = await prisma.wish.findMany({ where: { status: "APPROVED", date: { startsWith: yearPrefix } }, select: { userId: true, date: true } });

  const absences = new Map<string, Set<string>>();
  for (const a of absRows) (absences.get(a.date) ?? absences.set(a.date, new Set()).get(a.date)!).add(a.userId);
  const wishes = new Map<string, Set<string>>();
  for (const w of wishRows) (wishes.get(w.date) ?? wishes.set(w.date, new Set()).get(w.date)!).add(w.userId);

  const input: SchedulerInput = {
    year,
    users,
    holidays: new Set(holidays.map((h) => h.date)),
    absences,
    wishes,
    maxWeekendsPerMonth: settings.maxWeekendsPerMonth,
  };
  const { assignments, report } = generateSchedule(input);

  await prisma.plan.deleteMany({ where: { year } });
  const plan = await prisma.plan.create({ data: { year, status: "DRAFT", reportJson: JSON.stringify(report) } });
  await prisma.assignment.createMany({ data: assignments.map((a) => ({ planId: plan.id, date: a.date, slot: a.slot, userId: a.userId })) });

  revalidatePath("/admin/plan");
  revalidatePath("/plan");
  const issues = report.uncovered.length;
  const exclNote = excluded.length > 0 ? ` ${excluded.length} OA ohne Rufdienst-Fähigkeit nicht eingeplant (${excluded.join(", ")}).` : "";
  return {
    level: issues > 0 ? "warn" : "ok",
    message:
      (issues > 0
        ? `Vorläufiger Plan erstellt – ${issues} unbesetzte Stelle(n), siehe Engpassbericht.`
        : "Vorläufiger Plan erstellt – keine unbesetzten Stellen.") + exclNote,
  };
}

export async function releasePlan(year: number): Promise<ActionResult> {
  await requireStaff();
  await prisma.plan.update({ where: { year }, data: { status: "RELEASED", releasedAt: new Date() } });
  revalidatePath("/admin/plan");
  revalidatePath("/plan");
  return { level: "ok", message: "Dienstplan freigegeben – jetzt für alle sichtbar." };
}

export async function deletePlan(year: number): Promise<ActionResult> {
  await requireStaff();
  await prisma.plan.deleteMany({ where: { year } });
  revalidatePath("/admin/plan");
  revalidatePath("/plan");
  return { level: "ok", message: "Plan verworfen." };
}

// ============================ Hilfen ============================
function revalidateAll() {
  revalidatePath("/calendar");
  revalidatePath("/entries");
  revalidatePath("/matrix");
  revalidatePath("/team");
  revalidatePath("/admin/approvals");
  revalidatePath("/admin/requests");
  revalidatePath("/dashboard");
}
