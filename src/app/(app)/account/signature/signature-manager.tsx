"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Star, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { SignaturePad, type SignatureResult } from "@/components/signature-pad";
import { createSignature, updateSignature, deleteSignature, setDefaultSignature, type ActionResult } from "../actions";

export type SignatureRow = {
  id: string;
  label: string | null;
  method: string;
  image_data_url: string;
  is_default: boolean;
  created_at: string;
};

export function SignatureManager({ signatures }: { signatures: SignatureRow[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editingLabel, setEditingLabel] = React.useState<SignatureRow | null>(null);
  const [labelInput, setLabelInput] = React.useState("");

  async function run(action: (fd: FormData) => Promise<ActionResult>, fd: FormData, key: string, onOk?: () => void) {
    setBusy(key); setError(null);
    const res = await action(fd);
    setBusy(null);
    if (res?.error) { setError(res.error); return; }
    onOk?.();
    router.refresh();
  }

  async function handleSave(result: SignatureResult) {
    setBusy("save"); setError(null);
    const fd = new FormData();
    fd.set("method", result.method);
    fd.set("image_data_url", result.imageDataUrl);
    if (result.typedText) fd.set("typed_text", result.typedText);
    if (result.typedFont) fd.set("typed_font", result.typedFont);
    if (signatures.length === 0) fd.set("is_default", "true");
    const res = await createSignature(fd);
    setBusy(null);
    if (res?.error) { setError(res.error); return; }
    setOpen(false);
    router.refresh();
  }

  function onDelete(id: string) {
    if (!confirm("Delete this signature? Documents already signed with it keep their record — only future signing is affected.")) return;
    const fd = new FormData();
    fd.set("id", id);
    run(deleteSignature, fd, `del-${id}`);
  }

  function onSetDefault(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    run(setDefaultSignature, fd, `def-${id}`);
  }

  function onSaveLabel(e: React.FormEvent) {
    e.preventDefault();
    if (!editingLabel) return;
    const fd = new FormData();
    fd.set("id", editingLabel.id);
    fd.set("label", labelInput);
    run(updateSignature, fd, `label-${editingLabel.id}`, () => setEditingLabel(null));
  }

  return (
    <div className="space-y-4">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {signatures.map((s) => (
          <div key={s.id} className="rounded-lg border border-border p-4">
            <div className="mb-3 flex h-20 items-center justify-center rounded-md bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.image_data_url} alt="Signature" className="max-h-16 max-w-full object-contain" />
            </div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">{s.label || (s.method === "typed" ? "Typed signature" : "Drawn signature")}</p>
              {s.is_default && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Default</span>}
            </div>
            <div className="flex gap-1">
              {!s.is_default && (
                <Button variant="ghost" size="icon" disabled={busy === `def-${s.id}`} onClick={() => onSetDefault(s.id)} title="Set as default" aria-label="Set as default">
                  <Star className="size-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => { setEditingLabel(s); setLabelInput(s.label ?? ""); }} title="Rename" aria-label="Rename">
                <Pencil className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="text-destructive" disabled={busy === `del-${s.id}`} onClick={() => onDelete(s.id)} title="Delete" aria-label="Delete">
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => { setError(null); setOpen(true); }}
          className="flex h-full min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Plus className="size-5" /> New signature
        </button>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="New signature" description="Type your name in a script style, or draw it — used the same way either way.">
        <SignaturePad onSave={handleSave} saving={busy === "save"} />
      </Dialog>

      <Dialog open={editingLabel !== null} onClose={() => setEditingLabel(null)} title="Rename signature">
        {editingLabel && (
          <form onSubmit={onSaveLabel} className="space-y-4">
            <Input value={labelInput} onChange={(e) => setLabelInput(e.target.value)} placeholder="e.g. Formal signature" autoFocus />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingLabel(null)}>Cancel</Button>
              <Button type="submit" disabled={busy === `label-${editingLabel.id}`}><Check className="size-4" /> Save</Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
