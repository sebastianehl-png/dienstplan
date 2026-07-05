import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteGroup } from "@/lib/actions";
import { CreateGroupForm, MembershipEditor } from "./GroupControls";

export default async function GroupsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isStaff(me.role)) redirect("/dashboard");

  const [groups, users] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { members: true } } } }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, groups: { select: { groupId: true } } },
    }),
  ]);

  const userRows = users.map((u) => ({ id: u.id, name: u.name, groupIds: u.groups.map((g) => g.groupId) }));
  const groupCols = groups.map((g) => ({ id: g.id, name: g.name }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Gruppen / Subgruppen</h1>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 font-medium text-zinc-900">Neue Gruppe</h2>
        <CreateGroupForm />
        {groups.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-sm">
                {g.name} <span className="text-xs text-zinc-400">({g._count.members})</span>
                <form
                  action={async () => {
                    "use server";
                    await deleteGroup(g.id);
                  }}
                >
                  <button className="text-xs text-zinc-400 hover:text-red-600" title="Gruppe löschen">✕</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 font-medium text-zinc-900">Mitglieder zuordnen (Mehrfachzugehörigkeit möglich)</h2>
        <MembershipEditor users={userRows} groups={groupCols} />
      </div>
    </div>
  );
}
