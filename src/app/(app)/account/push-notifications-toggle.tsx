"use client";

import * as React from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savePushSubscription, removePushSubscription } from "./actions";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type Status = "checking" | "unsupported" | "denied" | "off" | "on" | "busy";

export function PushNotificationsToggle() {
  const [status, setStatus] = React.useState<Status>("checking");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setError(null);
    setStatus("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("Push notifications aren't configured yet.");

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });
      const json = sub.toJSON();
      const fd = new FormData();
      fd.set("endpoint", json.endpoint ?? "");
      fd.set("p256dh", json.keys?.p256dh ?? "");
      fd.set("auth", json.keys?.auth ?? "");
      fd.set("user_agent", navigator.userAgent);
      const res = await savePushSubscription(fd);
      if (res.error) throw new Error(res.error);
      setStatus("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable notifications.");
      setStatus("off");
    }
  }

  async function disable() {
    setError(null);
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const fd = new FormData();
        fd.set("endpoint", sub.endpoint);
        await removePushSubscription(fd);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not disable notifications.");
      setStatus("on");
    }
  }

  if (status === "checking") return null;
  if (status === "unsupported") {
    return (
      <p className="text-sm text-muted-foreground">
        This browser doesn&apos;t support push notifications.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {status === "on" && (
        <div className="flex items-center gap-3">
          <BellRing className="size-4 text-green-600" />
          <p className="text-sm text-foreground">Notifications are enabled on this device.</p>
          <Button variant="outline" size="sm" onClick={disable}>
            <BellOff className="size-4" /> Turn off
          </Button>
        </div>
      )}
      {status === "off" && (
        <div className="flex items-center gap-3">
          <Bell className="size-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Not enabled on this device yet.</p>
          <Button size="sm" onClick={enable}>
            <Bell className="size-4" /> Enable notifications
          </Button>
        </div>
      )}
      {status === "denied" && (
        <p className="text-sm text-muted-foreground">
          Notifications are blocked for this app in your browser/phone settings — enable them there, then reload this page.
        </p>
      )}
      {status === "busy" && <p className="text-sm text-muted-foreground">Working…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
