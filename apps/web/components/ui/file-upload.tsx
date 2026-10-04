"use client";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  accept?: Record<string, string[]>;
  maxSize?: number;
  maxFiles?: number;
  value?: File[];
  onChange?: (files: File[]) => void;
  error?: boolean;
}

export function FileUpload({ accept, maxSize, maxFiles = 1, value = [], onChange, error }: FileUploadProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      const next = maxFiles === 1 ? accepted.slice(0, 1) : [...value, ...accepted].slice(0, maxFiles);
      onChange?.(next);
    },
    [value, onChange, maxFiles],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    maxFiles,
  });

  const remove = (index: number) => {
    onChange?.(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border px-6 py-8 text-center transition hover:border-primary hover:bg-primary/5",
          isDragActive && "border-primary bg-primary/5",
          error && "border-destructive",
        )}
      >
        <input {...getInputProps()} />
        <Upload className="mb-2 size-8 text-slate-400" />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {isDragActive ? "Drop files here" : "Drag & drop files, or click to browse"}
        </p>
        {maxSize && (
          <p className="mt-1 text-xs text-slate-400">Max size: {(maxSize / 1024 / 1024).toFixed(0)}MB</p>
        )}
      </div>

      {value.length > 0 && (
        <ul className="space-y-1">
          {value.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
              <span className="truncate">{file.name}</span>
              <button type="button" onClick={() => remove(i)} className="ml-2 text-slate-400 hover:text-destructive">
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
