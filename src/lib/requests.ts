import { prisma } from "./prisma";
import { weekday } from "./dates";

export type CommentItem = { id: string; text: string; authorName: string; authorId: string; createdAt: string };
export type LogItem = { action: string; at: string; byName: string | null; detail: string | null };

export type LeaveRequest = {
  groupId: string;
  target: "absence" | "wish";
  kind: "VACATION" | "SPECIAL" | "WISH";
  userId: string;
  userName: string;
  start: string;
  end: string;
  days: number;
  weekdays: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "MIXED";
  createdAt: string; // ursprüngliches Eintragsdatum
  approvedAt: string | null;
  approvedByName: string | null;
  modifiedAt: string | null; // letzte Änderung (falls nachträglich bearbeitet)
  comments: CommentItem[];
  logs: LogItem[];
};

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
    kind: "VACATION" | "SPECIAL" | "WISH";
    userId: string;
    userName: string;
    dates: string[];
    statuses: Set<string>;
    createdAt: Date;
    approvedAt: Date | null;
    approvedById: string | null;
  };
  const groups = new Map<string, Acc>();

  const ingest = (rows: typeof absences | typeof wishes, target: "absence" | "wish") => {
    for (const r of rows as (typeof absences[number] & { type?: string })[]) {
      const g = groups.get(r.groupId);
      const kind = target === "wish" ? "WISH" : ((r.type as "VACATION" | "SPECIAL") ?? "VACATION");
      if (!g) {
        groups.set(r.groupId, {
          target,
          kind,
          userId: r.userId,
          userName: r.user.name,
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

  const result: LeaveRequest[] = [];
  for (const [groupId, g] of groups) {
    const dates = g.dates.sort();
    const weekdays = g.kind === "VACATION" ? dates.filter((d) => weekday(d) !== 0 && weekday(d) !== 6).length : dates.length;
    const status: LeaveRequest["status"] =
      g.statuses.size > 1 ? "MIXED" : g.statuses.has("APPROVED") ? "APPROVED" : g.statuses.has("REJECTED") ? "REJECTED" : "PENDING";
    const createdAt = (createdByGroup.get(groupId) ?? g.createdAt).toISOString();
    result.push({
      groupId,
      target: g.target,
      kind: g.kind,
      userId: g.userId,
      userName: g.userName,
      start: dates[0],
      end: dates[dates.length - 1],
      days: dates.length,
      weekdays,
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
