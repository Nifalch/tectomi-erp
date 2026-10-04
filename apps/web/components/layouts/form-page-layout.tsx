"use client";

import type { ReactNode, FormEvent } from "react";
import type { ModuleKey } from "@nuro7/contracts";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { MODULE_META } from "@nuro7/contracts";

interface FormPageLayoutProps {
  module: ModuleKey;
  title: string;
  breadcrumbs: BreadcrumbItem[];
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel?: string;
  loading?: boolean;
  children: ReactNode;
  /** Optional extra buttons rendered between Cancel and the primary submit. */
  extraActions?: ReactNode;
}

export function FormPageLayout({
  module,
  title,
  breadcrumbs,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  loading,
  children,
  extraActions,
}: FormPageLayoutProps) {
  const meta = MODULE_META[module];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs items={breadcrumbs} />

      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full" style={{ backgroundColor: meta?.hex }} />
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="rounded-2xl border border-border bg-white p-6 dark:bg-slate-900/80">
          <div className="space-y-5">{children}</div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          {extraActions}
          <Button
            type="submit"
            disabled={loading}
            className="text-white"
            style={{ backgroundColor: meta?.hex }}
          >
            {loading ? "Saving..." : submitLabel}
          </Button>
        </div>
      </form>
    </div>
  );
}
