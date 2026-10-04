"use client";
import { useToastStore } from "@/lib/hooks/use-toast";
import { ToastItem } from "./toast";

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} variant={t.variant} title={t.title} description={t.description} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}
