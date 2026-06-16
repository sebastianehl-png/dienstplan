import { cookies } from "next/headers";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// --- Passwörter ---
export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}
export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

// --- Session über signiertes Cookie (HMAC) ---
// Prototyp-tauglich; für Produktion ggf. auf serverseitige Sessions umstellen.
const SECRET = process.env.SESSION_SECRET || "dev-only-secret-change-me";
const COOKIE = "session";

function sign(value: string): string {
  const mac = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  return `${value}.${mac}`;
}
function unsign(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const value = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  const expected = crypto.createHmac("sha256", SECRET).update(value).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

export async function createSession(userId: string) {
  const store = await cookies();
  store.set(COOKIE, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE);
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  const userId = unsign(token);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) return null;
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

// "Staff" = Sub-Admin oder Voll-Admin (darf Einträge verwalten/freigeben,
// Resturlaub übertragen, Gruppen/Nutzer verwalten, Plan erstellen).
export function isStaff(role: string) {
  return role === "ADMIN" || role === "SUBADMIN";
}

export async function requireStaff() {
  const user = await requireUser();
  if (!isStaff(user.role)) throw new Error("FORBIDDEN");
  return user;
}

// Nur Voll-Admin: globale Einstellungen, ADMIN-Rechte vergeben/entziehen.
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}
