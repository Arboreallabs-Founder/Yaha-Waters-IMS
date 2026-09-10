"use client";

import * as React from "react";

/**
 * Renders a QR code (PNG data URL) for the given value, client-side. The
 * `qrcode` library is imported on demand inside the effect so it stays out of
 * the bundle of every page that merely *might* show a code; the pulse
 * placeholder below covers the moment it takes to arrive.
 */
export function QrCode({ value, size = 160, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = React.useState<string>("");
  React.useEffect(() => {
    let active = true;
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(value, { margin: 1, width: size, errorCorrectionLevel: "M" }),
      )
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
