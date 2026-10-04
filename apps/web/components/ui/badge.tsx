import { type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
        positive: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
        warning: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
        destructive: "bg-red-500/12 text-red-700 dark:text-red-300",
        info: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
        dashboard: "bg-blue-500/12 text-blue-600",
        projects: "bg-violet-500/12 text-violet-600",
        tasks: "bg-amber-500/12 text-amber-600",
        clients: "bg-cyan-500/12 text-cyan-600",
        hr: "bg-pink-500/12 text-pink-600",
        attendance: "bg-teal-500/12 text-teal-600",
        leave: "bg-purple-500/12 text-purple-600",
        time: "bg-indigo-500/12 text-indigo-600",
        accounts: "bg-green-500/12 text-green-600",
        invoices: "bg-emerald-500/12 text-emerald-600",
        proposals: "bg-sky-500/12 text-sky-600",
        reports: "bg-rose-500/12 text-rose-600",
        settings: "bg-stone-500/12 text-stone-600",
      },
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        md: "px-3 py-1 text-xs",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "md",
    },
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  dot?: boolean;
  count?: number;
}

export function Badge({ className, tone, size, dot, count, children, ...props }: BadgeProps) {
  if (count !== undefined) {
    return (
      <span
        className={cn(
          "inline-flex size-5 items-center justify-center rounded-full text-[10px] font-bold",
          tone === "destructive" ? "bg-red-500 text-white" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
          className,
        )}
        {...props}
      >
        {count > 99 ? "99+" : count}
      </span>
    );
  }

  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {dot && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
