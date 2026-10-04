"use client";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, error, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-primary dark:bg-slate-950/60",
        error && "border-destructive focus:border-destructive",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";
