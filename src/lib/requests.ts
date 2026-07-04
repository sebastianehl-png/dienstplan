import { prisma } from "./prisma";
import { weekday } from "./dates";
import { getTypeMap } from "./absence-types";

export type CommentItem = { id: string; text: string; authorName: string; authorId: string; createdAt: string };
export type LogItem = { action: string; at: string; byName: string | null; detail: string | null };

export type LeaveRequest = {
  groupId: string;
  target: "absence" | "wish";
  kind: string; // "WISH" oder Code einer AbsenceType
  kindName: string; // Anzeigename, z.B. "Urlaub"
  kindShort: string; // Kürzel, z.B. "U"
  kindColor: string; // Hex-Farbe
  userId: string;
  userName: string;
  substituteId: string | null;
  substituteName: string | null;
  start: string;
  end: string;
  days: number;
  weekdays: number;
  vacationCounting: boolean; // Art zählt ins Urlaubskonto
  status: "PENDING" | "APPROVED" | "REJECTED" | "MIXED";
  createdAt: string; // ursprüngliches Eintragsdatum
  approvedAt: string | null;
  approvedByName: string | null;
  modifiedAt: string | null; // letzte Änderung (falls nachträglich bearbeitet)
  comments: CommentItem[];
  logs: LogItem[];
};

const WISH_META = { name: "Freiwunsch", short: "FW", color: "#06b6d4" };

type Filter = { yearPrefix?: string; userId?: string; pendingOnly?: boolean };

// Baut aus den Tageszeilen (Absence/Wish) gruppierte Anträge inkl. Protokoll & Kommentaren.
export async function getRequests(filter: Filter = {}): Promise<LeaveRequest[]> {
  const dateWhere = filter.yearPrefix ? { startsWith: filter.yearPrefix } : undefined;
  const baseWhere = {
    ...(dateWhere ? { date: dateWhere } : {}),
    ...(filter.userId ? { userId: filter.userId } : {}),
    ...(filter.pendingOnly ? { status: "PENDING" } : {}),
  };

  const [absences, wishes, users] = await Promise.all([
    prisma.absence.findMany({ where: baseWhere, include: { user: { select: { name: true } } } }),
    prisma.wish.findMany({ where: baseWhere, include: { user: { select: { name: true } } } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  type Acc = {
    target: "absence" | "wish";
    kind: string;
    userId: string;
    userName: string;
    substituteId: string | null;
    dates: string[];
    statuses: Set<string>;
    createdAt: Date;
    approvedAt: Date | null;
    approvedById: string | null;
  };
  const groups = new Map<string, Acc>();

  const ingest = (rows: typeof absences | typeof wishes, target: "absence" | "wish") => {
    for (const r of rows as (typeof absences[number] & { type?: string; substituteId?: string | null })[]) {
      const g = groups.get(r.groupId);
      const kind = target === "wish" ? "WISH" : (r.type ?? "VACATION");
      if (!g) {
        groups.set(r.groupId, {
          target,
          kind,
          userId: r.userId,
          userName: r.user.name,
          substituteId: r.substituteId ?? null,
          dates: [r.date],
          statuses: new Set([r.status]),
          createdAt: r.createdAt,
          approvedAt: r.approvedAt ?? null,
          approvedById: r.approvedById ?? null,
        });
      } else {
        g.dates.push(r.date);
        g.statuses.add(r.status);
        if (r.createdAt < g.createdAt) g.createdAt = r.createdAt;
        if (r.approvedAt && (!g.approvedAt || r.approvedAt > g.approvedAt)) g.approvedAt = r.approvedAt;
        if (r.approvedById) g.approvedById = r.approvedById;
      }
    }
  };
  ingest(absences, "absence");
  ingest(wishes, "wish");

  const groupIds = Array.from(groups.keys());
  const [logs, comments] = await Promise.all([
    prisma.leaveLog.findMany({ where: { groupId: { in: groupIds } }, orderBy: { at: "asc" } }),
    prisma.comment.findMany({ where: { groupId: { in: groupIds } }, include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const logsByGroup = new Map<string, LogItem[]>();
  const createdByGroup = new Map<string, Date>();
  const modifiedByGroup = new Map<string, Date>();
  for (const l of logs) {
    const arr = logsByGroup.get(l.groupId) ?? [];
    arr.push({ action: l.action, at: l.at.toISOString(), byName: l.byUserId ? nameOf.get(l.byUserId) ?? null : null, detail: l.detail });
    logsByGroup.set(l.groupId, arr);
    if (l.action === "CREATED") createdByGroup.set(l.groupId, l.at);
    if (l.action === "MODIFIED") modifiedByGroup.set(l.groupId, l.at);
  }
  const commentsByGroup = new Map<string, CommentItem[]>();
  for (const c of comments) {
    const arr = commentsByGroup.get(c.groupId) ?? [];
    arr.push({ id: c.id, text: c.text, authorName: c.author.name, authorId: c.authorId, createdAt: c.createdAt.toISOString() });
    commentsByGroup.set(c.groupId, arr);
  }

  const typeMap = await getTypeMap();

  const result: LeaveRequest[] = [];
  for (const [groupId, g] of groups) {
    const dates = g.dates.sort();
    const meta = g.kind === "WISH" ? WISH_META : (() => {
      const t = typeMap.get(g.kind);
      return t ? { name: t.name, short: t.short, color: t.color } : { name: g.kind, short: "?", color: "#64748b" };
    })();
    const countsAsVacation = g.kind !== "WISH" && (typeMap.get(g.kind)?.countsAsVacation ?? false);
    const weekdays = countsAsVacation ? dates.filter((d) => weekday(d) !== 0 && weekday(d) !== 6).length : dates.length;
    const status: LeaveRequest["status"] =
      g.statuses.size > 1 ? "MIXED" : g.statuses.has("APPROVED") ? "APPROVED" : g.statuses.has("REJECTED") ? "REJECTED" : "PENDING";
    const createdAt = (createdByGroup.get(groupId) ?? g.createdAt).toISOString();
    result.push({
      groupId,
      target: g.target,
      kind: g.kind,
      kindName: meta.name,
      kindShort: meta.short,
      kindColor: meta.color,
      userId: g.userId,
      userName: g.userName,
      substituteId: g.substituteId,
      substituteName: g.substituteId ? nameOf.get(g.substituteId) ?? null : null,
      start: dates[0],
      end: dates[dates.length - 1],
      days: dates.length,
      weekdays,
      vacationCounting: countsAsVacation,
      status,
      createdAt,
      approvedAt: g.approvedAt ? g.approvedAt.toISOString() : null,
      approvedByName: g.approvedById ? nameOf.get(g.approvedById) ?? null : null,
      modifiedAt: modifiedByGroup.get(groupId)?.toISOString() ?? null,
      comments: commentsByGroup.get(groupId) ?? [],
      logs: logsByGroup.get(groupId) ?? [],
    });
  }
  result.sort((a, b) => a.start.localeCompare(b.start) || a.userName.localeCompare(b.userName));
  return result;
}
