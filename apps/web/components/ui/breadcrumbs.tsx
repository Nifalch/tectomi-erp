import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav className={cn("flex items-center gap-1.5 text-sm", className)}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="size-3.5 text-slate-300 dark:text-slate-600" />}
            {item.href && !isLast ? (
              <Link href={item.href} className="text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                {item.label}
              </Link>
            ) : (
              <span className={cn(isLast ? "font-medium text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400")}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
