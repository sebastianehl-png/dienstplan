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

// Genehmigte Urlaubs-Werktage (Mo–Fr) im Jahr
export async function countVacationWeekdays(userId: string, year: number): Promise<number> {
  const rows = await prisma.absence.findMany({
    where: { userId, type: "VACATION", status: "APPROVED", date: { startsWith: String(year) } },
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

function rangeLabel(start: string, end: string, kind: string): string {
  const t = kind === "VACATION" ? "Urlaub" : kind === "SPECIAL" ? "Sonderurlaub" : "Freiwunsch";
  return start === end ? `${formatDE(start)} · ${t}` : `${formatDE(start)}–${formatDE(end)} · ${t}`;
}

async function checkConcurrency(date: string, exceptUserId: string): Promise<boolean> {
  const settings = await getSettings();
  const c = await prisma.absence.count({
    where: { date, type: "VACATION", status: "APPROVED", userId: { not: exceptUserId } },
  });
  return c < settings.maxConcurrentAbsent;
}

// Schreibt einen Antrag (mehrere Tage) für einen Nutzer; ersetzt vorhandene Tage.
async function writeRange(opts: {
  userId: string;
  start: string;
  end: string;
  kind: "VACATION" | "SPECIAL" | "WISH";
  status: "PENDING" | "APPROVED";
  approvedById?: string | null;
  groupId?: string;
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
      await prisma.absence.create({ data: { userId: opts.userId, date, type: opts.kind, status: opts.status, groupId, approvedAt, approvedById: opts.approvedById ?? null } });
    }
  }
  return groupId;
}

// ============================ Eigene Kalendereinträge (Bereich) ============================
// Trägt einen zusammenhängenden Zeitraum als EINEN Antrag ein (PENDING bis Freigabe).
export async function setRange(start: string, end: string, kind: "VACATION" | "SPECIAL" | "WISH" | "NONE"): Promise<ActionResult> {
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

  const groupId = await writeRange({ userId: user.id, start, end, kind, status: "PENDING" });
  await prisma.leaveLog.create({ data: { groupId, action: "CREATED", byUserId: user.id, detail: rangeLabel(start, end, kind) } });
  revalidateAll();
  const n = eachDate(start, end).length;
  return { level: "ok", message: `Antrag über ${n} Tag(e) gespeichert – wartet auf Freigabe.` };
}

// ============================ Freigabe / Bearbeitung durch Staff ============================
export async function approveGroup(groupId: string): Promise<ActionResult> {
  const actor = await requireStaff();
  const absRows = await prisma.absence.findMany({ where: { groupId } });
  const wishRows = await prisma.wish.findMany({ where: { groupId } });
  if (absRows.length === 0 && wishRows.length === 0) return { level: "error", message: "Antrag nicht gefunden." };

  // FCFS-Prüfung für Urlaubstage
  for (const a of absRows) {
    if (a.status === "APPROVED") continue;
    if (a.type === "VACATION" && !(await checkConcurrency(a.date, a.userId))) {
      return { level: "error", message: `Freigabe nicht möglich: am ${formatDE(a.date)} ist bereits das Maximum im Urlaub.` };
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
export async function editGroup(groupId: string, start: string, end: string, kind: "VACATION" | "SPECIAL" | "WISH"): Promise<ActionResult> {
  const actor = await requireUser();
  const first = (await prisma.absence.findFirst({ where: { groupId } })) ?? (await prisma.wish.findFirst({ where: { groupId } }));
  if (!first) return { level: "error", message: "Antrag nicht gefunden." };

  const staff = isStaff(actor.role);
  const isOwner = first.userId === actor.id;
  if (!staff && !(isOwner && first.status === "PENDING")) {
    return { level: "error", message: "Bearbeiten nicht möglich (nur eigene, noch nicht freigegebene Anträge)." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { level: "error", message: "Ungültiges Datum." };

  // Alte Tage des Antrags entfernen, neue mit gleicher groupId anlegen.
  await prisma.absence.deleteMany({ where: { groupId } });
  await prisma.wish.deleteMany({ where: { groupId } });
  // Staff-Bearbeitung gilt als freigegeben, Owner-Bearbeitung muss neu freigegeben werden.
  const status = staff ? "APPROVED" : "PENDING";
  await writeRange({ userId: first.userId, start, end, kind, status, approvedById: staff ? actor.id : null, groupId });
  await prisma.leaveLog.create({
    data: { groupId, action: "MODIFIED", byUserId: actor.id, detail: rangeLabel(start, end, kind) },
  });
  revalidateAll();
  return { level: "ok", message: "Antrag geändert (ursprüngliches Eintragsdatum bleibt erhalten)." };
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
  const category = Number(formData.get("category"));
  let role = String(formData.get("role") ?? "DOCTOR");
  const password = String(formData.get("password") ?? "");
  if (!name || !email || ![1, 2].includes(category) || password.length < 4) {
    return { level: "error", message: "Bitte alle Felder korrekt ausfüllen (Passwort ≥ 4 Zeichen)." };
  }
  if (!["DOCTOR", "SUBADMIN", "ADMIN"].includes(role)) role = "DOCTOR";
  if (role === "ADMIN" && actor.role !== "ADMIN") {
    return { level: "error", message: "Nur Voll-Admins dürfen Admin-Rechte vergeben." };
  }
  if (await prisma.user.findUnique({ where: { email } })) return { level: "error", message: "Diese E-Mail ist bereits vergeben." };
  await prisma.user.create({ data: { name, email, category, role, passwordHash: await hashPassword(password) } });
  revalidatePath("/admin/users");
  return { level: "ok", message: `${name} angelegt.` };
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
export async function generatePlan(year: number): Promise<ActionResult> {
  await requireStaff();
  const settings = await getSettings();
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, category: true } });

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
  return {
    level: issues > 0 ? "warn" : "ok",
    message: issues > 0 ? `Vorläufiger Plan erstellt – ${issues} unbesetzte Stelle(n), siehe Engpassbericht.` : "Vorläufiger Plan erstellt – keine unbesetzten Stellen.",
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
