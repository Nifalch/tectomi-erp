"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { TextArea } from "@/components/ui/textarea";
import { ErrorState, LoadingState } from "@/components/ui/state";
import { useEmployeeNotes, useAddHrNote, useDeleteHrNote } from "@/lib/api/employee-profile";
import { useAuthStore } from "@/lib/store/auth-store";

const HR_ROLES = ["SUPER_ADMIN", "ADMIN", "HR_MANAGER"];

const CATEGORIES = [
  { value: "GENERAL", label: "General" },
  { value: "KUDOS", label: "Kudos" },
  { value: "DISCIPLINARY", label: "Disciplinary" },
  { value: "ACCOMMODATION", label: "Accommodation" },
];

export function NotesTab({ userId }: { userId: string }) {
  const q = useEmployeeNotes(userId);
  const add = useAddHrNote(userId);
  const del = useDeleteHrNote(userId);
  const isHr = useAuthStore((s) => (s.user?.roles ?? []).some((r) => HR_ROLES.includes(r)));

  const [body, setBody] = useState("");
  const [category, setCategory] = useState("GENERAL");

  const submit = () => {
    if (!body.trim()) return;
    add.mutate({ body: body.trim(), category }, { onSuccess: () => setBody("") });
  };

  if (q.isLoading) return <LoadingState label="Loading notes..." />;
  if (q.isError || !q.data) return <ErrorState label="Unable to load notes." />;

  const notes = q.data.notes;

  return (
    <div className="flex flex-col gap-4">
      {isHr && (
        <Card>
          <h3 className="mb-3 font-semibold">Add note</h3>
          <div className="flex flex-col gap-2">
            <Select value={category} onValueChange={setCategory} options={CATEGORIES} />
            <TextArea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a private HR note..." rows={3} />
            <Button onClick={submit} disabled={add.isPending || !body.trim()} className="self-end">
              {add.isPending ? "Adding..." : "Add note"}
            </Button>
          </div>
        </Card>
      )}
      <Card>
        <h3 className="mb-3 font-semibold">Notes ({notes.length})</h3>
        {notes.length === 0 ? (
          <p className="text-sm text-slate-500">No notes recorded.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral" size="sm">{n.category}</Badge>
                    <span className="text-xs text-slate-500">
                      by {n.author.firstName} {n.author.lastName} · {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {isHr && (
                    <Button size="sm" variant="ghost" onClick={() => del.mutate(n.id)} disabled={del.isPending}>
                      Delete
                    </Button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
