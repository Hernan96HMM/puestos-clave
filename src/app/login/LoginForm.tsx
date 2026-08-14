"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Email" type="email" name="email" required autoComplete="email" />
      <Field label="Contraseña" type="password" name="password" required autoComplete="current-password" />
      {state.error && (
        <p role="alert" className="text-sm text-risk-high">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>
    </form>
  );
}
