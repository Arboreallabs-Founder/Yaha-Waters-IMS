"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Users as UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import { createUser, updateUser, createTeam, type ActionResult } from "./actions";

type AppUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  team_id: string | null;
  is_active: boolean;
  created_at: string;
};
type Team = { id: string; name: string };

const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export function UsersManager({ users, teams }: { users: AppUser[]; teams: Team[] }) {
  const router = useRouter();
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<AppUser | null>(null);
  const [teamOpen, setTeamOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function run(action: (fd: FormData) => Promise<ActionResult>, form: HTMLFormElement, onOk: () => void) {
    setPending(true);
    setError(null);
    const res = await action(new FormData(form));
    setPending(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    onOk();
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{users.length} users · {teams.length} teams</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setError(null); setTeamOpen(true); }}>
            <UsersIcon className="size-4" /> Add team
          </Button>
          <Button onClick={() => { setError(null); setCreating(true); }}>
            <Plus className="size-4" /> Add user
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-16 text-right">Edit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">{u.full_name ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{u.email}</TableCell>
              <TableCell><Badge>{ROLE_LABELS[u.role]}</Badge></TableCell>
              <TableCell>{u.team_id ? teamName.get(u.team_id) ?? "—" : "—"}</TableCell>
              <TableCell>
                {u.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(u.created_at)}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={() => { setError(null); setEditing(u); }} aria-label="Edit">
                  <Pencil className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Create user */}
      <Dialog open={creating} onClose={() => setCreating(false)} title="Add user" description="Provisions a sign-in (no email verification needed).">
        <form
          onSubmit={(e) => { e.preventDefault(); run(createUser, e.currentTarget, () => setCreating(false)); }}
          className="space-y-4"
        >
          <Field label="Full name"><Input name="full_name" required /></Field>
          <Field label="Email"><Input name="email" type="email" required /></Field>
          <Field label="Temporary password"><Input name="password" type="text" minLength={6} required placeholder="min 6 characters" /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role">
              <Select name="role" defaultValue="team_member">
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </Select>
            </Field>
            <Field label="Team">
              <Select name="team_id" defaultValue="">
                <option value="">— none —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
          </div>
          <FormFooter error={error} pending={pending} onCancel={() => setCreating(false)} />
        </form>
      </Dialog>

      {/* Edit user */}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title="Edit user" description={editing?.email}>
        {editing && (
          <form
            onSubmit={(e) => { e.preventDefault(); run(updateUser, e.currentTarget, () => setEditing(null)); }}
            className="space-y-4"
          >
            <input type="hidden" name="id" value={editing.id} />
            <Field label="Full name"><Input name="full_name" defaultValue={editing.full_name ?? ""} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Role">
                <Select name="role" defaultValue={editing.role}>
                  {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              </Field>
              <Field label="Team">
                <Select name="team_id" defaultValue={editing.team_id ?? ""}>
                  <option value="">— none —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="is_active" defaultChecked={editing.is_active} className="size-4 rounded border-input" />
              <span className="text-sm font-medium">Active (can sign in)</span>
            </label>
            <FormFooter error={error} pending={pending} onCancel={() => setEditing(null)} />
          </form>
        )}
      </Dialog>

      {/* Create team */}
      <Dialog open={teamOpen} onClose={() => setTeamOpen(false)} title="Add team">
        <form
          onSubmit={(e) => { e.preventDefault(); run(createTeam, e.currentTarget, () => setTeamOpen(false)); }}
          className="space-y-4"
        >
          <Field label="Team name"><Input name="name" required placeholder="Planning, Procurement, Stores…" /></Field>
          <FormFooter error={error} pending={pending} onCancel={() => setTeamOpen(false)} />
        </form>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function FormFooter({ error, pending, onCancel }: { error: string | null; pending: boolean; onCancel: () => void }) {
  return (
    <>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </>
  );
}
