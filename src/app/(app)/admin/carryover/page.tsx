import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CarryoverEditor from "./CarryoverEditor";

const PLAN_YEAR = new Date().getFullYear();

export default async function CarryoverPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isStaff(me.role)) redirect("/dashboard");

  const [users, carryovers] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, category: true } }),
    prisma.carryover.findMany({ where: { year: PLAN_YEAR } }),
  ]);
  const map = new Map(carryovers.map((c) => [c.userId, c.days]));
  const rows = users.map((u) => ({ id: u.id, name: u.name, category: u.category, days: map.get(u.id) ?? 0 }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Resturlaub übertragen · {PLAN_YEAR}</h1>
        <p className="text-zinc-500">Tage aus dem Vorjahr werden zum Urlaubskontingent {PLAN_YEAR} addiert.</p>
      </div>
      <CarryoverEditor year={PLAN_YEAR} users={rows} />
    </div>
  );
}
