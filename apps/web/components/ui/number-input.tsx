"use client";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  value?: number | null;
  onChange?: (value: number | null) => void;
  prefix?: string;
  suffix?: string;
  error?: boolean;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, value, onChange, prefix, suffix, error, ...props }, ref) => {
    return (
      <div className="relative">
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">{prefix}</span>
        )}
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9.]/g, "");
            if (raw === "") { onChange?.(null); return; }
            const num = parseFloat(raw);
            if (!isNaN(num)) onChange?.(num);
          }}
          className={cn(
            "h-11 w-full rounded-2xl border border-border bg-white/80 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-primary dark:bg-slate-950/60",
            prefix ? "pl-12 pr-4" : "px-4",
            suffix && "pr-12",
            error && "border-destructive focus:border-destructive",
            className,
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>
        )}
      </div>
    );
  }
);
NumberInput.displayName = "NumberInput";
