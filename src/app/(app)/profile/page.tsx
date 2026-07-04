import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { countVacationWeekdays, getVacationLimit } from "@/lib/actions";

const PLAN_YEAR = new Date().getFullYear();

// Eigene Personalakte – Leseansicht für alle Mitarbeitenden.
export default async function ProfilePage() {
  const user = await requireUser();
  const [vacUsed, vacLimit] = await Promise.all([
    countVacationWeekdays(user.id, PLAN_YEAR),
    getVacationLimit(user.id, PLAN_YEAR),
  ]);

  const de = (d: string | null) => (d ? d.split("-").reverse().join(".") : "–");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Meine Personalakte</h1>
        <p className="text-zinc-500">Leseansicht – Änderungen bitte über die Sub-Admins.</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Row k="Name" v={user.name} />
          <Row k="E-Mail" v={user.email} />
          <Row k="Position" v={user.position ?? "–"} />
          <Row k="Telefon" v={user.phone ?? "–"} />
          <Row k="Adresse" v={user.address ?? "–"} />
          <Row k="Notfallkontakt" v={user.emergency ?? "–"} />
          <Row k="Geburtsdatum" v={de(user.birthDate)} />
          <Row k="Eintrittsdatum" v={de(user.hireDate)} />
          <Row k="Wochenstunden" v={user.weeklyHours != null ? String(user.weeklyHours) : "–"} />
          <Row k={`Urlaub ${PLAN_YEAR}`} v={`${vacUsed} / ${vacLimit} Werktage`} />
        </dl>
      </div>

      <p className="text-sm text-zinc-500">
        Passwort ändern? <Link href="/password" className="text-blue-700 hover:underline">Hier entlang</Link>.
      </p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-zinc-400">{k}</dt>
      <dd className="text-zinc-800">{v}</dd>
    </div>
  );
}
