"use client";

import * as React from "react";
import QRCode from "qrcode";

/** Renders a QR code (PNG data URL) for the given value, client-side. */
export function QrCode({ value, size = 160, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = React.useState<string>("");
  React.useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { margin: 1, width: size, errorCorrectionLevel: "M" })
      .then((url) => active && setSrc(url))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!src) return <div style={{ width: size, height: size }} className={`animate-pulse rounded bg-muted ${className ?? ""}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={value} className={className} />;
}
