"use client";

import * as React from "react";
import { Dancing_Script, Great_Vibes, Sacramento } from "next/font/google";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const dancingScript = Dancing_Script({ subsets: ["latin"], weight: "700" });
const greatVibes = Great_Vibes({ subsets: ["latin"], weight: "400" });
const sacramento = Sacramento({ subsets: ["latin"], weight: "400" });

const FONTS = [
  { id: "dancing-script", label: "Dancing Script", font: dancingScript },
  { id: "great-vibes", label: "Great Vibes", font: greatVibes },
  { id: "sacramento", label: "Sacramento", font: sacramento },
];

export type SignatureResult = {
  method: "typed" | "drawn";
  typedText?: string;
  typedFont?: string;
  imageDataUrl: string;
};

/** Type-or-draw signature capture. Always normalizes to a PNG data URL, regardless of method. */
export function SignaturePad({
  onSave,
  saving = false,
}: {
  onSave: (result: SignatureResult) => void;
  saving?: boolean;
}) {
  const [mode, setMode] = React.useState<"typed" | "drawn">("typed");
  const [typedText, setTypedText] = React.useState("");
  const [fontId, setFontId] = React.useState(FONTS[0].id);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawingRef = React.useRef(false);
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const [hasDrawing, setHasDrawing] = React.useState(false);

  const selectedFont = FONTS.find((f) => f.id === fontId) ?? FONTS[0];

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
  }

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastPointRef.current = getPos(e);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    const pos = getPos(e);
    const last = lastPointRef.current ?? pos;
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPointRef.current = pos;
    setHasDrawing(true);
  }

  function onPointerUp() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  async function handleSave() {
    if (mode === "drawn") {
      const canvas = canvasRef.current;
      if (!canvas || !hasDrawing) return;
      onSave({ method: "drawn", imageDataUrl: canvas.toDataURL("image/png") });
      return;
    }
    const text = typedText.trim();
    if (!text) return;
    const fontFamily = selectedFont.font.style.fontFamily;
    try {
      await document.fonts.load(`48px ${fontFamily}`, text);
      await document.fonts.ready;
    } catch {
      // best-effort — canvas falls back to a default font if this fails
    }
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 160;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111827";
    ctx.font = `48px ${fontFamily}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    onSave({ method: "typed", typedText: text, typedFont: selectedFont.id, imageDataUrl: canvas.toDataURL("image/png") });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-md border border-border p-1">
        <button
          type="button"
          onClick={() => setMode("typed")}
          className={cn("flex-1 rounded px-3 py-1.5 text-sm font-medium", mode === "typed" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
        >
          Type
        </button>
        <button
          type="button"
          onClick={() => setMode("drawn")}
          className={cn("flex-1 rounded px-3 py-1.5 text-sm font-medium", mode === "drawn" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
        >
          Draw
        </button>
      </div>

      {mode === "typed" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Your name</Label>
            <Input value={typedText} onChange={(e) => setTypedText(e.target.value)} placeholder="e.g. Rakesh M." autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Style</Label>
            <div className="flex flex-wrap gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFontId(f.id)}
                  className={cn("rounded-md border px-3 py-1.5 text-xs", fontId === f.id ? "border-primary bg-primary/10" : "border-border hover:bg-accent")}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4">
            <span className={cn(selectedFont.font.className, "text-3xl text-foreground")}>
              {typedText.trim() || "Your signature"}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <canvas
            ref={canvasRef}
            width={480}
            height={160}
            className="w-full touch-none rounded-md border border-dashed border-border bg-muted/30"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          <Button type="button" variant="outline" size="sm" onClick={clearCanvas}>Clear</Button>
        </div>
      )}

      <Button type="button" onClick={handleSave} disabled={saving || (mode === "typed" ? !typedText.trim() : !hasDrawing)}>
        {saving ? "Saving…" : "Save signature"}
      </Button>
    </div>
  );
}
