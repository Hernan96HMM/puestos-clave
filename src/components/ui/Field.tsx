import type { InputHTMLAttributes } from "react";
import { Input } from "./Input";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Field({ label, error, id, name, ...inputProps }: FieldProps) {
  const fieldId = id ?? name;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm font-medium text-text">
        {label}
      </label>
      <Input id={fieldId} name={name} {...inputProps} />
      {error && (
        <p role="alert" className="text-sm text-risk-high">
          {error}
        </p>
      )}
    </div>
  );
}
