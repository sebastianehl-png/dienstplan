import Link from "next/link";
import ResetForm from "./ResetForm";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Neues Passwort</h1>
        {token ? (
          <ResetForm token={token} />
        ) : (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Kein gültiger Link. Bitte fordere einen neuen an.{" "}
            <Link href="/forgot" className="font-medium underline">Passwort vergessen</Link>
          </p>
        )}
      </div>
    </div>
  );
}
