import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countVacationWeekdays, getVacationLimit } from "@/lib/actions";

const PLAN_YEAR = new Date().getFullYear();

export default async function PersonnelListPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isStaff(me.role)) redirect("/dashboard");

  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: [{ name: "asc" }],
    include: { groups: { include: { group: true } } },
  });

  const rows = await Promise.all(
    users.map(async (u) => ({
      ...u,
      vacUsed: await countVacationWeekdays(u.id, PLAN_YEAR),
      vacLimit: await getVacationLimit(u.id, PLAN_YEAR),
    }))
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Digitale Personalakte</h1>
        <p className="text-zinc-500">Stammdaten aller Mitarbeitenden – klick auf einen Namen zum Bearbeiten.</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Position</th>
              <th className="px-4 py-2">Gruppen</th>
              <th className="px-4 py-2">Wochenstunden</th>
              <th className="px-4 py-2">Eintritt</th>
              <th className="px-4 py-2">Urlaub {PLAN_YEAR}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                <td className="px-4 py-2">
                  <Link href={`/admin/personnel/${u.id}`} className="font-medium text-blue-700 hover:underline">
                    {u.name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-zinc-600">{u.position ?? "–"}</td>
                <td className="px-4 py-2 text-xs text-zinc-500">{u.groups.map((g) => g.group.name).join(", ") || "–"}</td>
                <td className="px-4 py-2">{u.weeklyHours ?? "–"}</td>
                <td className="px-4 py-2">{u.hireDate ? u.hireDate.split("-").reverse().join(".") : "–"}</td>
                <td className="px-4 py-2">
                  <span className={u.vacUsed > u.vacLimit ? "text-red-600" : ""}>
                    {u.vacUsed} / {u.vacLimit}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
