"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSubstitute } from "@/lib/actions";

export default function SubstituteSelect({
  groupId,
  value,
  options,
}: {
  groupId: string;
  value: string | null;
  options: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function change(next: string) {
    const prev = current;
    setCurrent(next);
    start(async () => {
      const res = await setSubstitute(groupId, next || null);
      if (res.level === "error") {
        setErr(res.message);
        setCurrent(prev);
      } else {
        setErr(null);
        router.refresh();
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <select
        value={current}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="rounded border border-zinc-300 px-2 py-1 text-xs"
      >
        <option value="">– keine –</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {err && <span className="text-red-600">{err}</span>}
    </span>
  );
}
