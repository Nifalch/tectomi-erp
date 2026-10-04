"use client";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToastVariant } from "@/lib/hooks/use-toast";

const variantConfig: Record<ToastVariant, { icon: typeof CheckCircle2; borderColor: string; iconColor: string }> = {
  success: { icon: CheckCircle2, borderColor: "border-l-emerald-500", iconColor: "text-emerald-500" },
  error: { icon: XCircle, borderColor: "border-l-red-500", iconColor: "text-red-500" },
  warning: { icon: AlertTriangle, borderColor: "border-l-amber-500", iconColor: "text-amber-500" },
  info: { icon: Info, borderColor: "border-l-blue-500", iconColor: "text-blue-500" },
};

interface ToastItemProps {
  variant: ToastVariant;
  title: string;
  description?: string;
  onDismiss: () => void;
}

export function ToastItem({ variant, title, description, onDismiss }: ToastItemProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-[360px] items-start gap-3 rounded-xl border border-border bg-white p-4 shadow-panel dark:bg-slate-900",
        "border-l-4",
        config.borderColor,
        "animate-in slide-in-from-right-full fade-in-0 duration-300",
      )}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", config.iconColor)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      <button onClick={onDismiss} className="shrink-0 text-slate-400 transition hover:text-slate-600">
        <X className="size-4" />
      </button>
    </div>
  );
}
