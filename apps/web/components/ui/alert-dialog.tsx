"use client";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { AlertTriangle, Trash2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "warning" | "default";
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}

const variantConfig = {
  destructive: { icon: Trash2, iconColor: "text-red-500", btnClass: "bg-red-600 hover:bg-red-700 text-white" },
  warning: { icon: AlertTriangle, iconColor: "text-amber-500", btnClass: "bg-amber-600 hover:bg-amber-700 text-white" },
  default: { icon: Info, iconColor: "text-blue-500", btnClass: "bg-primary text-white hover:opacity-90" },
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  loading,
}: ConfirmDialogProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-panel duration-200 dark:bg-slate-900 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="mb-4 flex items-start gap-3">
            <div className={cn("mt-0.5 rounded-lg bg-slate-100 p-2 dark:bg-slate-800", config.iconColor)}>
              <Icon className="size-5" />
            </div>
            <div>
              <AlertDialogPrimitive.Title className="text-base font-semibold text-slate-950 dark:text-white">
                {title}
              </AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {description}
              </AlertDialogPrimitive.Description>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary" size="sm">{cancelLabel}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-semibold transition disabled:opacity-50",
                  config.btnClass,
                )}
              >
                {loading ? "..." : confirmLabel}
              </button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
