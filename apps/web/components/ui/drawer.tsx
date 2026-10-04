"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: "max-w-[400px]",
  md: "max-w-[560px]",
  lg: "max-w-[720px]",
  // xl exists for two-column drawers (task detail) that need more room
  // so the property sidebar doesn't squeeze the main content into a strip.
  xl: "max-w-[920px]",
} as const;

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: keyof typeof sizeMap;
  children: React.ReactNode;
}

export function Drawer({ open, onOpenChange, title, description, size = "md", children }: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 w-full bg-white shadow-panel dark:bg-slate-900",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-300",
            sizeMap[size],
          )}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between border-b border-border px-6 py-4">
              <div>
                <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              <DialogPrimitive.Close className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
