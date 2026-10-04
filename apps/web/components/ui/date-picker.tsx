"use client";
import * as React from "react";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import "react-day-picker/style.css";

interface DatePickerProps {
  value?: Date | null;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  error?: boolean;
  disabled?: boolean;
}

export function DatePicker({ value, onChange, placeholder = "Pick a date", minDate, maxDate, error, disabled }: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        disabled={disabled}
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-2xl border border-border bg-white/80 px-4 text-sm outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-950/60",
          error && "border-destructive focus:border-destructive",
          !value && "text-slate-400",
        )}
      >
        <CalendarDays className="size-4 shrink-0" />
        {value ? format(value, "PPP") : placeholder}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="z-50 rounded-xl border border-border bg-white p-4 shadow-panel dark:bg-slate-900 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          sideOffset={4}
          align="start"
        >
          <DayPicker
            mode="single"
            selected={value ?? undefined}
            onSelect={(day) => {
              onChange?.(day);
              setOpen(false);
            }}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            // react-day-picker v9: explicit classNames are required to
            // get a usable calendar — the bundled stylesheet leaves
            // cells un-sized so the grid renders as crammed plain text.
            classNames={{
              months: "flex flex-col gap-3",
              month: "flex flex-col gap-3",
              month_caption: "flex items-center justify-center relative h-9",
              caption_label: "text-sm font-semibold",
              nav: "absolute inset-x-0 top-0 flex items-center justify-between px-1",
              button_previous: "inline-flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800",
              button_next: "inline-flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800",
              month_grid: "border-collapse",
              weekdays: "flex",
              weekday: "w-9 text-center text-[11px] font-medium text-slate-400",
              week: "flex",
              day: "size-9 text-center text-sm",
              day_button: "inline-flex size-9 items-center justify-center rounded-md hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/40 dark:hover:bg-slate-800",
              selected: "[&_button]:bg-primary [&_button]:text-white [&_button]:hover:bg-primary/90",
              today: "[&_button]:font-bold [&_button]:text-primary",
              outside: "text-slate-300 dark:text-slate-600",
              disabled: "text-slate-300 dark:text-slate-600 cursor-not-allowed",
              hidden: "invisible",
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
