import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  name?: string;
  description?: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function FormField({ label, name, description, required, error, className, children }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={name} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {description && <p className="text-xs text-slate-500">{description}</p>}
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
