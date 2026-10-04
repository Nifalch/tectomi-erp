"use client";
import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(({ className, error, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[80px] w-full resize-y rounded-2xl border border-border bg-white/80 px-4 py-3 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-primary dark:bg-slate-950/60",
        error && "border-destructive focus:border-destructive",
        className,
      )}
      {...props}
    />
  );
});
TextArea.displayName = "TextArea";
