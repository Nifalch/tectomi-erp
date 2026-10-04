"use client";
import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  options: SelectOption[];
  error?: boolean;
  disabled?: boolean;
  name?: string;
  /** `md` (default) — form field; `sm` — compact filter bar */
  size?: "sm" | "md";
  className?: string;
}

// Radix Select disallows empty-string item values. We transparently map
// `""` option values to this sentinel so call sites can keep passing `""`
// for "None"/"All" options without crashing.
const EMPTY_SENTINEL = "__nuro_select_empty__";

export function Select({ value, onValueChange, placeholder = "Select...", options, error, disabled, name, size = "md", className }: SelectProps) {
  const innerValue = value === "" || value === undefined ? undefined : value;
  const handleChange = (v: string) => {
    onValueChange?.(v === EMPTY_SENTINEL ? "" : v);
  };
  const sizeClass =
    size === "sm"
      ? "h-8 rounded-lg px-2.5 text-xs"
      : "h-11 rounded-2xl px-4 text-sm";
  return (
    <SelectPrimitive.Root value={innerValue} onValueChange={handleChange} disabled={disabled} name={name}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex w-full items-center justify-between gap-1 truncate whitespace-nowrap border border-border bg-white/80 outline-none placeholder:text-slate-400 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950/60",
          sizeClass,
          error && "border-destructive focus:border-destructive",
          !value && "text-slate-400",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className={cn(size === "sm" ? "size-3.5" : "size-4", "shrink-0 text-slate-400")} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="relative z-50 max-h-72 min-w-[8rem] overflow-hidden rounded-xl border border-border bg-white shadow-panel dark:bg-slate-900 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => {
              const itemValue = option.value === "" ? EMPTY_SENTINEL : option.value;
              return (
                <SelectPrimitive.Item
                  key={itemValue}
                  value={itemValue}
                  disabled={option.disabled}
                  className="relative flex cursor-pointer select-none items-center rounded-lg py-2.5 pl-9 pr-3 text-sm outline-none hover:bg-slate-100 focus:bg-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:hover:bg-slate-800 dark:focus:bg-slate-800"
                >
                  <SelectPrimitive.ItemIndicator className="absolute left-3">
                    <Check className="size-4 text-primary" />
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              );
            })}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
