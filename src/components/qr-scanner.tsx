"use client";

import * as React from "react";
import { Camera, CameraOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Minimal BarcodeDetector typing (not in lib.dom yet).
type DetectedBarcode = { rawValue: string };
type BD = { detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]> };
declare global {
  interface Window {
    BarcodeDetector?: { new (opts?: { formats?: string[] }): BD };
  }
}

/**
 * Low-level QR/lot-code scanner: camera (BarcodeDetector, falling back to
 * @zxing/browser) + manual entry. Fires `onDetect(code)` once per lookup;
 * the caller owns what happens with the resolved code (business logic lives
 * in the consumer, not here).
 */
export function QrScanner({ onDetect, pending }: { onDetect: (code: string) => void; pending?: boolean }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const zxingRef = React.useRef<{ reset: () => void } | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [manual, setManual] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const stopCamera = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    zxingRef.current?.reset();
    zxingRef.current = null;
    setScanning(false);
  }, []);

  React.useEffect(() => () => stopCamera(), [stopCamera]);

  function detect(code: string) {
    stopCamera();
    onDetect(code);
  }

  async function startCamera() {
    setError(null);
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
                if (codes[0]?.rawValue) { detect(codes[0].rawValue); return; }
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
          if (result) detect(result.getText());
        });
      }
    } catch {
      setError("Camera unavailable. Use manual entry below. (Camera needs HTTPS or localhost.)");
      setScanning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {scanning ? (
          <Button type="button" variant="outline" onClick={stopCamera}><CameraOff className="size-4" /> Stop</Button>
        ) : (
          <Button type="button" onClick={startCamera}><Camera className="size-4" /> Start camera</Button>
        )}
        <form
          onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { detect(manual.trim()); setManual(""); } }}
          className="flex flex-1 items-center gap-2 min-w-[220px]"
        >
          <Input placeholder="…or type lot code" value={manual} onChange={(e) => setManual(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={pending}><Search className="size-4" /> Look up</Button>
        </form>
      </div>
      <video ref={videoRef} className={scanning ? "w-full max-w-md rounded-lg border border-border" : "hidden"} muted playsInline />
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
