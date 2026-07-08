"use client";

import * as React from "react";
import { Camera, CameraOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveLot, type ResolvedLot } from "../inventory/actions";
import { LotActions } from "../inventory/lots/[id]/lot-actions";

// Minimal BarcodeDetector typing (not in lib.dom yet).
type DetectedBarcode = { rawValue: string };
type BD = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
declare global {
  interface Window {
    BarcodeDetector?: { new (opts?: { formats?: string[] }): BD };
  }
}

export function Scanner({
  projects,
  canManage,
}: {
  projects: { id: string; project_no: string }[];
  canManage: boolean;
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const zxingRef = React.useRef<{ reset: () => void } | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [manual, setManual] = React.useState("");
  const [lot, setLot] = React.useState<ResolvedLot | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    zxingRef.current?.reset();
    zxingRef.current = null;
    setScanning(false);
  }, []);

  React.useEffect(() => () => stopCamera(), [stopCamera]);

  async function lookup(code: string) {
    setError(null);
    setPending(true);
    const res = await resolveLot(code);
    setPending(false);
    if (res.error) { setError(res.error); return; }
    setLot(res.lot ?? null);
    stopCamera();
  }

  async function startCamera() {
    setError(null);
    setLot(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      if (window.BarcodeDetector) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const canvas = document.createElement("canvas");
        const tick = async () => {
          if (!streamRef.current || !videoRef.current) return;
          const v = videoRef.current;
          if (v.videoWidth) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(v, 0, 0);
              try {
                const codes = await detector.detect(canvas);
                if (codes[0]?.rawValue) { await lookup(codes[0].rawValue); return; }
              } catch { /* ignore frame errors */ }
            }
          }
          if (streamRef.current) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } else {
        // Fallback: @zxing/browser
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        zxingRef.current = reader as unknown as { reset: () => void };
        await reader.decodeFromVideoElement(videoRef.current!, (result) => {
          if (result) lookup(result.getText());
        });
      }
    } catch {
      setError("Camera unavailable. Use manual entry below. (Camera needs HTTPS or localhost.)");
      setScanning(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {scanning ? (
              <Button variant="outline" onClick={stopCamera}><CameraOff className="size-4" /> Stop</Button>
            ) : (
              <Button onClick={startCamera}><Camera className="size-4" /> Start camera</Button>
            )}
            <form onSubmit={(e) => { e.preventDefault(); if (manual.trim()) lookup(manual.trim()); }} className="flex flex-1 items-center gap-2 min-w-[220px]">
              <Input placeholder="…or type lot code" value={manual} onChange={(e) => setManual(e.target.value)} />
              <Button type="submit" variant="secondary" disabled={pending}><Search className="size-4" /> Look up</Button>
            </form>
          </div>
          <video ref={videoRef} className={scanning ? "w-full max-w-md rounded-lg border border-border" : "hidden"} muted playsInline />
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </CardContent>
      </Card>

      {lot && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{lot.component_label}</p>
                <p className="font-mono text-xs text-muted-foreground">{lot.lot_code}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Location: {lot.location ?? "—"}{lot.project_no ? ` · project ${lot.project_no}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">On hand</p>
                <p className="text-2xl font-semibold">{lot.qty_on_hand}</p>
                <Badge variant={lot.status === "available" ? "success" : "secondary"}>{lot.status}</Badge>
              </div>
            </div>
            <LotActions
              lotId={lot.id}
              qtyOnHand={lot.qty_on_hand}
              projects={projects}
              canManage={canManage}
              onDone={() => lookup(lot.lot_code)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
