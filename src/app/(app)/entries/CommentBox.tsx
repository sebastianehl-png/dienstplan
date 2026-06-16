"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addComment, deleteComment } from "@/lib/actions";

export type CommentItem = { id: string; text: string; authorName: string; authorId: string; createdAt: string };

export default function CommentBox({
  groupId,
  comments,
  currentUserId,
  canModerate,
}: {
  groupId: string;
  comments: CommentItem[];
  currentUserId: string;
  canModerate: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!text.trim()) return;
    start(async () => {
      await addComment(groupId, text);
      setText("");
      router.refresh();
    });
  }
  function remove(cid: string) {
    start(async () => {
      await deleteComment(cid);
      router.refresh();
    });
  }

  return (
    <div className="mt-2 space-y-2">
      {comments.length > 0 && (
        <ul className="space-y-1">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2 rounded-lg bg-zinc-50 px-3 py-1.5 text-sm">
              <span className="text-zinc-700">
                <span className="font-medium text-zinc-900">{c.authorName}:</span> {c.text}
              </span>
              {(c.authorId === currentUserId || canModerate) && (
                <button onClick={() => remove(c.id)} className="ml-auto text-xs text-zinc-400 hover:text-red-600">
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Kommentar hinzufügen…"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500"
        />
        <button onClick={submit} disabled={pending || !text.trim()} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
          Senden
        </button>
      </div>
    </div>
  );
}
