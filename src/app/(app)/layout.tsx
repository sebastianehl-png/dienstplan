import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { signOut } from "@/lib/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const staff = isStaff(user.role);
  const isAdmin = user.role === "ADMIN";

  const nav = [
    { href: "/dashboard", label: "Übersicht" },
    { href: "/calendar", label: "Mein Kalender" },
    { href: "/entries", label: "Meine Einträge" },
    { href: "/matrix", label: "Abwesenheiten" },
    { href: "/plan", label: "Dienstplan" },
    { href: "/profile", label: "Profil" },
  ];
  const staffNav = [
    { href: "/admin/approvals", label: "Freigaben" },
    { href: "/admin/requests", label: "Anträge" },
    { href: "/admin/personnel", label: "Personal" },
    { href: "/admin/plan", label: "Plan erstellen" },
    { href: "/admin/users", label: "Nutzer" },
    { href: "/admin/groups", label: "Gruppen" },
    { href: "/admin/absence-types", label: "Abw.-Arten" },
    { href: "/admin/carryover", label: "Resturlaub" },
  ];
  const adminNav = [{ href: "/admin/settings", label: "Einstellungen" }];

  const roleLabel = user.role === "ADMIN" ? "Admin" : user.role === "SUBADMIN" ? "Sub-Admin" : "Mitarbeiter";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <span className="font-semibold text-zinc-900">Dienstplanung</span>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900">
                {n.label}
              </Link>
            ))}
            {staff &&
              staffNav.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-50">
                  {n.label}
                </Link>
              ))}
            {isAdmin &&
              adminNav.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 font-medium text-blue-700 hover:bg-blue-50">
                  {n.label}
                </Link>
              ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/password" className="text-zinc-500 hover:text-zinc-800">
              {user.name} · Kat. {user.category} · {roleLabel}
            </Link>
            <form action={signOut}>
              <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-100">Abmelden</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
