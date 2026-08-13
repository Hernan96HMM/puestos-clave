# Fase 3a — Diseño Visual Base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply real SICA brand tokens (color/typography) and a small set of hand-rolled Tailwind UI primitives to the frontend Fase 2 already built (login, navbar, sector page, validación control) — pure presentation, zero changes to auth/RLS/data logic.

**Architecture:** Design tokens as CSS custom properties in `globals.css`, mapped into Tailwind v4's `@theme inline` block so they're usable as ordinary utility classes (`bg-primary`, `text-risk-high`, etc.). Five small, framework-free React components in `src/components/ui/` (`Input`, `Field`, `Button`, `Card`, `Badge`) — no new npm dependencies. Every existing page/component gets restyled using these tokens/primitives without touching its data-fetching or auth logic.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Tailwind CSS v4 (`@theme inline`, no `tailwind.config.js`), `next/font/google` (Titillium Web). No shadcn/ui, no Framer Motion, no new dependencies of any kind.

## Global Constraints

- No new npm dependencies — everything is plain Tailwind utility classes and hand-written React components.
- Path alias `@/*` → `./src/*` (already configured — `src/lib/db/query.ts` is `@/lib/db/query`, so `src/components/ui/Button.tsx` is `@/components/ui/Button`).
- Light theme only. Titillium Web only (no Gilroy — commercial font, no licensed files available). No `prefers-color-scheme` handling.
- Brand hex, from the SICA identity manual: primary `#21396E` (Pantone 534 C), secondary/accent `#2BA5D6` (Pantone 299 C).
- Risk colors (`riesgo-alto/medio/bajo`) are semantic red/amber/green, kept visually distinct from the brand blue/celeste — never reuse `--color-primary`/`--color-secondary` for a risk badge.
- No unit/component test suite exists in this project and this plan does not introduce one — verification per task is `npx tsc --noEmit` (must be clean) plus, where noted, `npm run build`. Final manual visual confirmation happens in the user's own browser via `npm run dev` — no screenshot/browser tool is available in the agent's execution environment.
- Zero changes to `src/auth.ts`, `src/auth.config.ts`, `src/lib/db/*`, any Server Action's logic, any SQL, or any route's data-fetching query — only JSX/className and, where stated, a file's top-level import list.
- Spanish UI copy throughout, matching the existing app.

---

### Task 1: Design tokens, typography, root layout

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: Tailwind utility classes usable by every later task — `bg-primary`, `text-primary`, `border-primary`, `bg-primary-hover`, `text-primary-hover`, `bg-secondary`, `text-secondary`, `border-secondary`, `bg-secondary-hover`, `bg-secondary-bg`, `text-secondary` (light celeste tint, for the navbar "editable" badge), `bg-bg`, `text-bg`, `bg-bg-subtle`, `text-bg-subtle`, `border-border`, `text-text`, `text-text-muted`, `bg-risk-high`, `text-risk-high`, `bg-risk-high-bg`, `bg-risk-medium`, `text-risk-medium`, `bg-risk-medium-bg`, `bg-risk-low`, `text-risk-low`, `bg-risk-low-bg`. Every task below uses these exact names — do not invent new ones.

- [ ] **Step 1: Replace `src/app/globals.css`**

Replace the entire file with:

```css
@import "tailwindcss";

:root {
  --primary: #21396e;
  --primary-hover: #17294f;
  --secondary: #2ba5d6;
  --secondary-hover: #228bb4;
  --secondary-bg: #e6f4fa;
  --bg: #ffffff;
  --bg-subtle: #f5f7fa;
  --border: #e2e8f0;
  --text: #171923;
  --text-muted: #5a6472;
  --risk-high: #dc2626;
  --risk-high-bg: #fee2e2;
  --risk-medium: #d97706;
  --risk-medium-bg: #fef3c7;
  --risk-low: #16a34a;
  --risk-low-bg: #dcfce7;
}

@theme inline {
  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hover);
  --color-secondary: var(--secondary);
  --color-secondary-hover: var(--secondary-hover);
  --color-secondary-bg: var(--secondary-bg);
  --color-bg: var(--bg);
  --color-bg-subtle: var(--bg-subtle);
  --color-border: var(--border);
  --color-text: var(--text);
  --color-text-muted: var(--text-muted);
  --color-risk-high: var(--risk-high);
  --color-risk-high-bg: var(--risk-high-bg);
  --color-risk-medium: var(--risk-medium);
  --color-risk-medium-bg: var(--risk-medium-bg);
  --color-risk-low: var(--risk-low);
  --color-risk-low-bg: var(--risk-low-bg);
  --font-sans: var(--font-titillium);
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-sans), sans-serif;
}
```

This removes the create-next-app scaffold's `--background`/`--foreground` variables, the unused `@media (prefers-color-scheme: dark)` block, and the hardcoded `font-family: Arial, Helvetica, sans-serif;`.

- [ ] **Step 2: Replace `src/app/layout.tsx`**

Replace the entire file with:

```tsx
import type { Metadata } from "next";
import { Titillium_Web } from "next/font/google";
import "./globals.css";

const titillium = Titillium_Web({
  variable: "--font-titillium",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
});

export const metadata: Metadata = {
  title: "F-116 · Puestos Clave",
  description: "Sistema de Gestión de Puestos Clave — SICA",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${titillium.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-text">{children}</body>
    </html>
  );
}
```

This drops the two Geist fonts (unused after this task — nothing else in the codebase imports them), fixes `lang="en"` → `lang="es"` (the whole app is Spanish-language), and fixes `metadata.title`/`metadata.description` (still said "Create Next App" since the Fase 1 scaffold).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Visual sanity check**

Run: `npm run build`
Expected: build succeeds (this also confirms `Titillium_Web` is a valid `next/font/google` export and the weight array is accepted).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: apply SICA brand tokens and Titillium Web typography"
```

---

### Task 2: `Input` and `Field` primitives

**Files:**
- Create: `src/components/ui/Input.tsx`
- Create: `src/components/ui/Field.tsx`

**Interfaces:**
- Consumes: `bg-bg`, `border-border`, `text-text`, `text-text-muted`, `focus:ring-secondary`, `focus:border-secondary`, `text-risk-high` utility classes (Task 1).
- Produces: `Input` — a styled `<input>` accepting every native `InputHTMLAttributes<HTMLInputElement>` prop plus an optional `className` override, default-exported as a named export `Input` from `@/components/ui/Input`. `Field` — named export from `@/components/ui/Field`, props `{ label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>`, renders `Input` internally. Task 6 (login form) and Task 10 (`ValidacionSelect`'s equivalent `<select>` styling) both rely on `Input`'s exact class list existing as a reusable visual reference.

- [ ] **Step 1: Write `src/components/ui/Input.tsx`**

```tsx
import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-md border border-border bg-bg px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Write `src/components/ui/Field.tsx`**

```tsx
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
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Input.tsx src/components/ui/Field.tsx
git commit -m "feat: add Input and Field UI primitives"
```

---

### Task 3: `Button` primitive

**Files:**
- Create: `src/components/ui/Button.tsx`

**Interfaces:**
- Consumes: `bg-primary`, `bg-primary-hover`, `text-primary`, `bg-bg-subtle` utility classes (Task 1).
- Produces: `Button` — named export from `@/components/ui/Button`, props `{ variant?: "primary" | "ghost" } & ButtonHTMLAttributes<HTMLButtonElement>` (default `variant="primary"`). Tasks 6 and 10 both render `<Button>` — its `disabled` behavior must pass straight through to the underlying `<button disabled>` since both callers already manage a `pending` boolean from `useActionState`.

- [ ] **Step 1: Write `src/components/ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  ghost: "bg-transparent text-primary hover:bg-bg-subtle",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Button.tsx
git commit -m "feat: add Button UI primitive"
```

---

### Task 4: `Card` primitive

**Files:**
- Create: `src/components/ui/Card.tsx`

**Interfaces:**
- Consumes: `border-border`, `bg-bg-subtle` utility classes (Task 1).
- Produces: `Card` — named export from `@/components/ui/Card`, props = every native `HTMLAttributes<HTMLDivElement>` plus optional `className` override (merged, not replaced). Tasks 6, 8, 9 all wrap content in `<Card>`.

- [ ] **Step 1: Write `src/components/ui/Card.tsx`**

```tsx
import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-lg border border-border bg-bg-subtle p-4 ${className}`} {...props} />;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Card.tsx
git commit -m "feat: add Card UI primitive"
```

---

### Task 5: `Badge` primitive

**Files:**
- Create: `src/components/ui/Badge.tsx`

**Interfaces:**
- Consumes: `bg-risk-high-bg`, `text-risk-high`, `bg-risk-medium-bg`, `text-risk-medium`, `bg-risk-low-bg`, `text-risk-low`, `bg-bg-subtle`, `text-text-muted`, `bg-secondary-bg`, `text-secondary` utility classes (Task 1).
- Produces: `Badge` — named export from `@/components/ui/Badge`, and the exported type `BadgeVariant` (a string union), both from `@/components/ui/Badge`. Props `{ variant: BadgeVariant; children: ReactNode }`. `BadgeVariant` is exactly: `"riesgo-alto" | "riesgo-medio" | "riesgo-bajo" | "validacion-pendiente" | "validacion-aprobado" | "validacion-observado" | "editable" | "solo-lectura"`. `Badge` does **not** map raw DB values (`"ALTO"`, `"pendiente"`, etc.) to variants itself — callers (Tasks 7 and 9) pass the exact variant string. This keeps `Badge` a pure presentational component with no domain knowledge.

- [ ] **Step 1: Write `src/components/ui/Badge.tsx`**

```tsx
import type { ReactNode } from "react";

export type BadgeVariant =
  | "riesgo-alto"
  | "riesgo-medio"
  | "riesgo-bajo"
  | "validacion-pendiente"
  | "validacion-aprobado"
  | "validacion-observado"
  | "editable"
  | "solo-lectura";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  "riesgo-alto": "bg-risk-high-bg text-risk-high",
  "riesgo-medio": "bg-risk-medium-bg text-risk-medium",
  "riesgo-bajo": "bg-risk-low-bg text-risk-low",
  "validacion-pendiente": "bg-bg-subtle text-text-muted",
  "validacion-aprobado": "bg-risk-low-bg text-risk-low",
  "validacion-observado": "bg-risk-medium-bg text-risk-medium",
  editable: "bg-secondary-bg text-secondary",
  "solo-lectura": "bg-bg-subtle text-text-muted",
};

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Badge.tsx
git commit -m "feat: add Badge UI primitive"
```

---

**⏸ Checkpoint (informal):** Tasks 1–5 are the full token/primitive foundation — nothing user-visible has changed yet (no page imports them). Tasks 6–10 restyle each existing page/component using these five primitives; each is independently testable/visible in the browser once done.

---

### Task 6: Login screen

**Files:**
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/login/LoginForm.tsx`

**Interfaces:**
- Consumes: `Card` (Task 4), `Field` (Task 2), `Button` (Task 3). `LoginForm`'s existing `loginAction`/`LoginState` import from `./actions` is unchanged — this task only touches JSX/className, never the Server Action.

- [ ] **Step 1: Replace `src/app/login/page.tsx`**

```tsx
import { Card } from "@/components/ui/Card";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-4 text-xl font-bold text-primary">F-116 · Puestos Clave</h1>
        <LoginForm />
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Replace `src/app/login/LoginForm.tsx`**

```tsx
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
```

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds, `/login` still in the route summary.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev`, open `/login`. Expected: a centered card on a white page, navy bold title "F-116 · Puestos Clave", two labeled fields with a visible border, a full-width navy "Ingresar" button. Typing a wrong password and submitting shows a red error line above the button.

- [ ] **Step 5: Commit**

```bash
git add src/app/login/page.tsx src/app/login/LoginForm.tsx
git commit -m "feat: style login screen with brand tokens and UI primitives"
```

---

### Task 7: Navbar and authenticated shell

**Files:**
- Modify: `src/app/(app)/components/Navbar.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `Badge` and `BadgeVariant` (Task 5).
- Produces: `Navbar` becomes a Client Component (`"use client"`) — this is a behavior change worth flagging explicitly: it now calls `usePathname()` from `next/navigation`, so it can no longer be rendered from a context that assumes it's server-only, but its props (`sectores`, `rol`, `sectorId`) and where it's rendered (`(app)/layout.tsx`) are unchanged, so no other task is affected.

- [ ] **Step 1: Replace `src/app/(app)/components/Navbar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";

interface Sector {
  id: string;
  nombre: string;
  slug: string;
}

export function Navbar({
  sectores,
  rol,
  sectorId,
}: {
  sectores: Sector[];
  rol: "gerente" | "direccion";
  sectorId: string | null;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 overflow-x-auto border-t border-border px-4 py-2">
      {sectores.map((sector) => {
        const isEditable = rol === "gerente" && sectorId === sector.id;
        const isActive = pathname === `/sector/${sector.slug}`;
        return (
          <Link
            key={sector.id}
            href={`/sector/${sector.slug}`}
            className={`flex shrink-0 flex-col items-center gap-1 border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
              isActive ? "border-secondary text-primary" : "border-transparent text-text-muted hover:text-primary"
            }`}
          >
            <span className="whitespace-nowrap">{sector.nombre}</span>
            <Badge variant={isEditable ? "editable" : "solo-lectura"}>
              {isEditable ? "Editable" : "Solo lectura"}
            </Badge>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Replace `src/app/(app)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { Navbar } from "./components/Navbar";

type SectorRow = {
  id: string;
  nombre: string;
  slug: string;
  orden: number;
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const sectores = await query<SectorRow>(
    "select id, nombre, slug, orden from sector order by orden"
  );

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto max-w-5xl px-4 pt-4">
          <h1 className="text-lg font-bold text-primary">F-116 · Puestos Clave</h1>
        </div>
        <Navbar sectores={sectores} rol={session.user.rol} sectorId={session.user.sectorId} />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
```

Only the returned JSX's wrapping elements changed — the `auth()`/`redirect()`/`query()` calls above it are byte-identical to before.

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual visual check**

Log in, expected: a white header with the navy app title, a horizontally-scrollable row of sector tabs below it, each with a small pill showing "Editable" (celeste tint) or "Solo lectura" (gray). The tab matching the current URL has a celeste underline and navy text; the rest are gray with a transparent underline that turns navy on hover.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/components/Navbar.tsx" "src/app/(app)/layout.tsx"
git commit -m "feat: style navbar with active-tab indicator and app shell"
```

---

### Task 8: Índice de dirección (`/`)

**Files:**
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `Card` (Task 4).

- [ ] **Step 1: Replace `src/app/(app)/page.tsx`**

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { Card } from "@/components/ui/Card";

type SectorRow = {
  nombre: string;
  slug: string;
};

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return null;

  // El gerente sólo administra su propio sector: lo mandamos directo ahí.
  if (session.user.rol === "gerente" && session.user.sectorId) {
    const rows = await query<SectorRow>("select nombre, slug from sector where id = $1", [
      session.user.sectorId,
    ]);
    const propio = rows[0];
    if (propio) redirect(`/sector/${propio.slug}`);
  }

  // Dirección (y cualquier caso sin sector propio resoluble) ve el índice.
  const sectores = await query<SectorRow>("select nombre, slug from sector order by orden");

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-primary">Sectores</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {sectores.map((s) => (
          <Card key={s.slug}>
            <Link href={`/sector/${s.slug}`} className="font-medium text-primary hover:underline">
              {s.nombre}
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

Every line above the `return` is byte-identical to the current file — only the JSX changed.

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual visual check**

Log in as `direccion@test.local` (see `docs/superpowers/plans/2026-08-04-credenciales-prueba.md`). Expected: a "Sectores" heading and a responsive grid of cards, one per sector, each a navy link to that sector's page. Logging in as a `gerente` should skip this page entirely and land directly on `/sector/<su-sector>`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/page.tsx"
git commit -m "feat: style direccion sector index with card grid"
```

---

### Task 9: Sector page

**Files:**
- Modify: `src/app/(app)/sector/[slug]/page.tsx`

**Interfaces:**
- Consumes: `Card` (Task 4), `Badge`/`BadgeVariant` (Task 5). Renders the existing `ValidacionSelect` component unchanged (same props: `evaluacionId`, `estadoActual`, `slug`) — Task 10 only changes `ValidacionSelect`'s internals, not its prop signature, so this task does not need to wait for Task 10.

- [ ] **Step 1: Replace `src/app/(app)/sector/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { ValidacionSelect } from "./ValidacionSelect";

type PuestoRow = {
  evaluacion_id: string;
  puesto_nombre: string;
  puntaje_ponderado_pct: number;
  clasificacion: string;
  nivel_riesgo: string;
  semaforo: string;
  validacion_direccion: string;
};

const RIESGO_VARIANT: Record<string, BadgeVariant> = {
  ALTO: "riesgo-alto",
  MEDIO: "riesgo-medio",
  BAJO: "riesgo-bajo",
};

const VALIDACION_VARIANT: Record<string, BadgeVariant> = {
  pendiente: "validacion-pendiente",
  aprobado: "validacion-aprobado",
  observado: "validacion-observado",
};

export default async function SectorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const sectorRows = await query<{ id: string; nombre: string }>(
    "select id, nombre from sector where slug = $1",
    [slug]
  );
  const sector = sectorRows[0];
  if (!sector) notFound();

  const puestos = await query<PuestoRow>(
    `select evaluacion_id, puesto_nombre, puntaje_ponderado_pct, clasificacion, nivel_riesgo, semaforo, validacion_direccion
     from vista_evaluacion_calculada
     where sector_id = $1
     order by puesto_nombre`,
    [sector.id]
  );

  const isDireccion = session.user.rol === "direccion";

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-primary">{sector.nombre}</h1>
      <div className="flex flex-col gap-3">
        {puestos.map((p) => (
          <Card
            key={p.evaluacion_id}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="font-medium text-text">{p.puesto_nombre}</span>
            <div className="flex items-center gap-2">
              <Badge variant={RIESGO_VARIANT[p.nivel_riesgo] ?? "validacion-pendiente"}>
                {p.clasificacion}
              </Badge>
              <span className="text-sm text-text-muted">{p.puntaje_ponderado_pct}%</span>
            </div>
            {isDireccion ? (
              <ValidacionSelect evaluacionId={p.evaluacion_id} estadoActual={p.validacion_direccion} slug={slug} />
            ) : (
              <Badge variant={VALIDACION_VARIANT[p.validacion_direccion] ?? "validacion-pendiente"}>
                {p.validacion_direccion}
              </Badge>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
```

The `?? "validacion-pendiente"` fallbacks exist only so a value outside the known set never crashes the page with a missing-key lookup — every value the database can actually produce (`nivel_riesgo` is always `ALTO`/`MEDIO`/`BAJO` per `vista_evaluacion_calculada`, `validacion_direccion` is always `pendiente`/`aprobado`/`observado` per the `validacion_puesto.estado` CHECK constraint) has an exact match in the maps above.

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds, `/sector/[slug]` still listed as a dynamic route.

- [ ] **Step 3: Manual visual check**

Visit any sector. Expected: a navy heading with the sector name, then one card per puesto — name on the left, a colored risk badge (red/amber/green matching `nivel_riesgo`) with the classification text plus the percentage next to it, and on the right either the validación control (if logged in as `direccion`) or a read-only badge showing the current `validacion_direccion` value. On a narrow window each card's contents stack vertically.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/sector/[slug]/page.tsx"
git commit -m "feat: style sector page with card list and risk/validacion badges"
```

---

### Task 10: `ValidacionSelect` styling

**Files:**
- Modify: `src/app/(app)/sector/[slug]/ValidacionSelect.tsx`

**Interfaces:**
- Consumes: `Button` (Task 3). Its `<select>` reuses `Input`'s visual language via matching Tailwind classes written directly on the element (not the `Input` component itself, since a `<select>` is a different DOM element) — no new `Select` component is introduced for this plan.

- [ ] **Step 1: Replace `src/app/(app)/sector/[slug]/ValidacionSelect.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { updateValidacionAction, type ValidacionActionState } from "./actions";
import { Button } from "@/components/ui/Button";

const initialState: ValidacionActionState = {};

export function ValidacionSelect({
  evaluacionId,
  estadoActual,
  slug,
}: {
  evaluacionId: string;
  estadoActual: string;
  slug: string;
}) {
  const [state, formAction, pending] = useActionState(updateValidacionAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-start gap-1 sm:items-end">
      <input type="hidden" name="evaluacionId" value={evaluacionId} />
      {/* La acción necesita el slug para revalidar esta misma ruta. */}
      <input type="hidden" name="slug" value={slug} />
      <div className="flex items-center gap-2">
        <select
          name="estado"
          defaultValue={estadoActual}
          disabled={pending}
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="pendiente">Pendiente</option>
          <option value="aprobado">Aprobado</option>
          <option value="observado">Observado</option>
        </select>
        <Button type="submit" disabled={pending} className="px-3 py-1.5 text-xs">
          Guardar
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-xs text-risk-high">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-xs text-risk-low">Guardado.</p>}
    </form>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual visual check**

Log in as `direccion@test.local`, open any sector. Expected: the `<select>` has the same border/focus styling as the login form's inputs, sitting next to a small navy "Guardar" button. Changing the value and saving shows a small green "Guardado." line; forcing an error (e.g. by testing as a `gerente` account, who the RLS policy rejects) shows a small red permission message instead.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/sector/[slug]/ValidacionSelect.tsx"
git commit -m "feat: style validacion select control"
```

---

## Final check

Run once, after Task 10:

```bash
npx tsc --noEmit
npm run build
npm run lint:sql
npm run verify:seed-counts
npm run verify:real-scores
```

All five must be clean — the last three confirm this plan didn't accidentally touch anything under `db/` or `scripts/` (it shouldn't have, per the Global Constraints, but they're cheap to re-run and this plan touches nothing that would make them fail).
