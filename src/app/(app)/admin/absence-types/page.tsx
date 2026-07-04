import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getAbsenceTypes } from "@/lib/absence-types";
import { prisma } from "@/lib/prisma";
import { TypeForm, TypeRowActions, type TypeRow } from "./TypeForm";

export default async function AbsenceTypesPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isStaff(me.role)) redirect("/dashboard");

  await getAbsenceTypes(); // legt eingebaute Arten an, falls sie fehlen
  const types = await prisma.absenceType.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Abwesenheitsarten</h1>
        <p className="text-zinc-500">
          Eigene Arten anlegen (z.B. Fortbildung, Dienstreise) und Regeln festlegen: Urlaubskonto, Abwesenheits-Limit, Freigabepflicht.
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 font-medium text-zinc-900">Neue Abwesenheitsart</h2>
        <TypeForm />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              <th className="px-4 py-2">Art</th>
              <th className="px-4 py-2">Kürzel</th>
              <th className="px-4 py-2">Urlaubskonto</th>
              <th className="px-4 py-2">Limit</th>
              <th className="px-4 py-2">Freigabe</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t.id} className={`border-t border-zinc-100 ${t.active ? "" : "opacity-50"}`}>
                <td className="px-4 py-2">
                  <span className="mr-2 inline-block h-3 w-3 rounded" style={{ backgroundColor: t.color }} />
                  <span className="text-zinc-800">{t.name}</span>
                  {t.builtin && <span className="ml-2 text-[10px] text-zinc-400">eingebaut</span>}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{t.short}</td>
                <td className="px-4 py-2">{t.countsAsVacation ? "✓" : "–"}</td>
                <td className="px-4 py-2">{t.countsForLimit ? "✓" : "–"}</td>
                <td className="px-4 py-2">{t.needsApproval ? "nötig" : "sofort wirksam"}</td>
                <td className="px-4 py-2">{t.active ? <span className="text-emerald-600">aktiv</span> : <span className="text-zinc-400">inaktiv</span>}</td>
                <td className="px-4 py-2">
                  <TypeRowActions row={t as TypeRow} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
