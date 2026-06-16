"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateUserRole } from "@/lib/actions";

export default function RoleSelect({ userId, role, canSetAdmin }: { userId: string; role: string; canSetAdmin: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function change(next: string) {
    setValue(next);
    start(async () => {
      const res = await updateUserRole(userId, next as "DOCTOR" | "SUBADMIN" | "ADMIN");
      if (res.level === "error") {
        setErr(res.message);
        setValue(role);
      } else {
        setErr(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="rounded border border-zinc-300 px-2 py-1 text-xs"
      >
        <option value="DOCTOR">Arzt</option>
        <option value="SUBADMIN">Sub-Admin</option>
        <option value="ADMIN" disabled={!canSetAdmin && value !== "ADMIN"}>
          Admin
        </option>
      </select>
      {err && <div className="mt-1 text-[11px] text-red-600">{err}</div>}
    </div>
  );
}
