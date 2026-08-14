import type { TextareaHTMLAttributes } from "react";

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-md border border-border bg-bg px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
