import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toggleUserActive } from "@/lib/actions";
import UserForm from "./UserForm";
import RoleSelect from "./RoleSelect";

export default async function UsersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isStaff(me.role)) redirect("/dashboard");
  const isAdmin = me.role === "ADMIN";

  const users = await prisma.user.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { groups: { include: { group: true } } },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Nutzerverwaltung</h1>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 font-medium text-zinc-900">Neuen Oberarzt anlegen</h2>
        <UserForm canCreateAdmin={isAdmin} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">E-Mail</th>
              <th className="px-4 py-2">Kat.</th>
              <th className="px-4 py-2">Gruppen</th>
              <th className="px-4 py-2">Rolle</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-zinc-100">
                <td className="px-4 py-2 text-zinc-800">{u.name}</td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-500">{u.email}</td>
                <td className="px-4 py-2">{u.category}</td>
                <td className="px-4 py-2 text-xs text-zinc-500">{u.groups.map((g) => g.group.name).join(", ") || "–"}</td>
                <td className="px-4 py-2">
                  <RoleSelect userId={u.id} role={u.role} canSetAdmin={isAdmin} />
                </td>
                <td className="px-4 py-2">
                  {u.active ? <span className="text-emerald-600">aktiv</span> : <span className="text-zinc-400">inaktiv</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={toggleUserActive.bind(null, u.id)}>
                    <button className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50">
                      {u.active ? "Deaktivieren" : "Aktivieren"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-400">Gruppen werden unter „Gruppen" zugeordnet. Admin-Rollen kann nur ein Voll-Admin vergeben.</p>
    </div>
  );
}
