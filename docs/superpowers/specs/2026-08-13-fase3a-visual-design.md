# Fase 3a — Diseño visual base (design tokens + estilizar el frontend existente)

## Contexto

`PROMPT_Claude_Code_SICA_F116.md` §4-§9 define una "Fase 3" grande: formulario de evaluación completo (10 preguntas, cálculo en vivo), dashboard MAESTRO (KPIs, gráficos), navbar animada, y pulido visual — todo junto. Es demasiado para un solo spec/plan, así que se decidió partirla en sub-proyectos:

- **3a (este spec)** — diseño visual base: tokens de marca + estilizar lo que ya existe (login, navbar, sector page, control de validación).
- **3b** — formulario de evaluación completo (10 preguntas, cálculo en vivo, guardado real para el gerente — hoy no existe ninguna UI para esto, solo se probó por RLS directo en `verify-rls.mjs`).
- **3c** — dashboard MAESTRO (KPIs, gráficos, tabla consolidada).
- **3d** (futuro, no comprometido) — animaciones avanzadas (scroll-reveal, headline animado, shared-element tab indicator) si hace falta después de 3a-3c.

Motivador inmediato: el frontend de Fase 2 (login, navbar, sector page, `ValidacionSelect`) se construyó deliberadamente sin ningún estilo — HTML semántico plano, sin clases de Tailwind — porque el plan de Fase 2 excluyó explícitamente "cualquier pulido visual" de su alcance. El usuario vio la pantalla de login resultante (texto plano sobre fondo negro por defecto del navegador) y preguntó si eso era un bug; no lo es, pero confirma que hace falta esta pasada.

## Alcance de este spec

Solo diseño visual — tokens (color/tipografía), un puñado de componentes UI reutilizables, y aplicar ambos a las pantallas que **ya existen y funcionan**: login, navbar + shell autenticado, índice de dirección, sector page, control de validación. Cero cambios de lógica de negocio, auth, RLS o queries — es una pasada de presentación sobre código que ya está probado y en producción.

**Explícitamente fuera de este spec** (quedan para 3b/3c/3d):
- Formulario de evaluación de 10 preguntas con cálculo en vivo.
- Dashboard MAESTRO (KPIs, gráficos, tabla consolidada).
- Indicador de tab activo tipo "barra deslizante" animada (shared-element transition) — se resuelve acá con un subrayado simple vía `transition-colors`; la versión animada con Framer Motion queda como candidato para 3d.
- shadcn/ui, Framer Motion, Magic UI/Stitch (MCP) — se evaluarán si 3c los necesita de verdad; introducirlos ahora sería prematuro para lo que este spec cubre.
- Logo/isotipo real (SVG/PNG) — no se proveyó el archivo; se resuelve con texto (nombre de la app en la tipografía y color de marca) hasta que exista el asset.
- Tipografía "Gilroy Semibold" del manual de marca (tagline) — es una fuente comercial sin archivos licenciados disponibles; se usa Titillium Web para todo (texto y títulos).
- Modo oscuro — solo tema claro por ahora.

## Fuente de la marca

Manual de identidad SICA (PDF provisto por el usuario):
- Primario: `#21396E` (Pantone 534 C)
- Secundario/acento: `#2BA5D6` (Pantone 299 C)
- Tipografía de texto: Titillium Web (Google Fonts)
- Tipografía de tagline: Gilroy Semibold (comercial, sin archivos disponibles — no se usa en este spec, ver "fuera de alcance")

## Design tokens

`src/app/globals.css` reemplaza el bloque actual (que trae `--background`/`--foreground` del scaffold de create-next-app más un bloque `prefers-color-scheme: dark` sin usar) por estas variables, expuestas también en `@theme inline` para poder usarlas como utilidades de Tailwind (`bg-primary`, `text-primary`, etc., siguiendo el mismo patrón que ya usa el archivo para `--color-background`):

| Token | Hex | Uso |
|---|---|---|
| `--color-primary` | `#21396E` | Navy de marca — navbar, headers, botón primario, foco |
| `--color-primary-hover` | `#17294F` | Hover/press de lo anterior |
| `--color-secondary` | `#2BA5D6` | Celeste de marca — acentos, indicador de tab activo, links |
| `--color-secondary-hover` | `#228BB4` | Hover de lo anterior |
| `--color-bg` | `#FFFFFF` | Fondo de página |
| `--color-bg-subtle` | `#F5F7FA` | Fondo de cards/secciones |
| `--color-border` | `#E2E8F0` | Bordes de inputs/cards |
| `--color-text` | `#171923` | Texto principal |
| `--color-text-muted` | `#5A6472` | Texto secundario (labels, ayuda) |
| `--color-risk-high` | `#DC2626` | Badge riesgo ALTO (texto/ícono) |
| `--color-risk-high-bg` | `#FEE2E2` | Badge riesgo ALTO (fondo) |
| `--color-risk-medium` | `#D97706` | Badge riesgo MEDIO (texto/ícono) |
| `--color-risk-medium-bg` | `#FEF3C7` | Badge riesgo MEDIO (fondo) |
| `--color-risk-low` | `#16A34A` | Badge riesgo BAJO (texto/ícono) |
| `--color-risk-low-bg` | `#DCFCE7` | Badge riesgo BAJO (fondo) |

Los colores de riesgo son semánticos (rojo/ámbar/verde), separados deliberadamente del azul/celeste de marca para que la señal de riesgo no se confunda con el color de navegación/UI. El `Badge` de riesgo se colorea a partir de `nivel_riesgo` (`ALTO`/`MEDIO`/`BAJO`, columna ya existente en `vista_evaluacion_calculada`), no del emoji de `semaforo` — un badge con texto+color es más consistente entre sistemas operativos que un emoji crudo.

`validacion_puesto.estado` (`pendiente`/`aprobado`/`observado`) usa su propio set de variantes de `Badge`, reutilizando los mismos tokens de riesgo por afinidad semántica: `aprobado` → verde (`risk-low`), `observado` → ámbar (`risk-medium`), `pendiente` → gris neutro (`--color-text-muted` sobre `--color-bg-subtle`, sin tinte de riesgo).

## Tipografía

Titillium Web (`next/font/google`) para todo — texto y títulos — reemplazando las fuentes Geist del scaffold en `src/app/layout.tsx`. De paso se corrige `metadata.title`/`metadata.description`, que todavía dicen "Create Next App" (deuda pendiente de Fase 1).

## Tema

Solo claro. Se elimina el bloque `@media (prefers-color-scheme: dark)` actual de `globals.css` — la app no sigue la preferencia de sistema por ahora.

## Componentes (`src/components/ui/`)

Carpeta nueva para componentes de UI compartidos entre rutas (separada de `src/app/(app)/components/`, que queda para componentes específicos de esa route group, como `Navbar`). Sin dependencias nuevas — Tailwind v4 (ya instalado) más componentes React chicos hechos a mano:

- **`Button.tsx`** — variantes `primary` (fondo navy, texto blanco) y `ghost` (texto navy, sin fondo). No maneja loading/disabled por sí mismo más allá de recibir la prop — el estado `pending` de `useActionState` ya lo resuelve cada formulario.
- **`Input.tsx`** — `<input>` estilizado: borde `--color-border`, foco con anillo en `--color-secondary`, variante de error.
- **`Field.tsx`** — wrapper de label + `Input` (lo renderiza internamente, no duplica el estilo) + mensaje de error, para no repetir la estructura en cada campo.
- **`Card.tsx`** — contenedor con fondo `--color-bg-subtle`, borde sutil, padding, radius. Envuelve el form de login y cada fila de puesto en la sector page.
- **`Badge.tsx`** — una sola API con variantes: `riesgo-alto` / `riesgo-medio` / `riesgo-bajo` (mapea desde `nivel_riesgo`), `validacion-pendiente` / `validacion-aprobado` / `validacion-observado` (mapea desde `estado`), y `editable` / `solo-lectura` (navbar). Todas son pastillas chicas con texto, mismo componente, distinto color por variant.

## Pantallas

**Login** (`src/app/login/page.tsx` + `LoginForm.tsx`): página centrada vertical/horizontalmente (`min-h-screen flex items-center justify-center`). `Card` conteniendo el `<h1>` (navy, bold) + el form. Cada campo usa `Field` + `Input`. Error de credenciales en rojo (`--color-risk-high`) debajo del form. `Button variant="primary"` full-width para "Ingresar", texto "Ingresando..." mientras `pending`.

**Navbar + shell autenticado** (`src/app/(app)/layout.tsx` + `Navbar.tsx`): header superior (fondo blanco, borde inferior `--color-border`) con el nombre de la app a la izquierda ("F-116 · Puestos Clave", texto navy) y la navbar de sectores. `Navbar` pasa a ser Client Component (`"use client"`) — es el único punto que necesita `usePathname()` de `next/navigation` para saber qué sector está activo; el resto de las páginas sigue siendo 100% Server Component, sin cambios en el patrón de fetch de datos. La navbar es una fila horizontal con `overflow-x-auto` (12 sectores no entran en una pantalla chica) — cada tab es el nombre del sector + `Badge` `editable`/`solo-lectura`, con un subrayado que pasa de transparente a `--color-secondary` vía `transition-colors` cuando el tab está activo (no una barra deslizante animada — ver "fuera de alcance"). El `<main>` tiene un contenedor con ancho máximo (`max-w-5xl mx-auto`) y padding consistente.

**Índice de dirección** (`src/app/(app)/page.tsx` — el gerente no lo ve, redirige server-side a su propio sector): grilla de `Card`, una por sector, cada una linkeando a `/sector/[slug]`.

**Sector page** (`src/app/(app)/sector/[slug]/page.tsx`): `<h1>` con el nombre del sector. Cada puesto es una `Card`-fila: nombre del puesto a la izquierda, `Badge riesgo-*` + texto de `clasificacion` + `puntaje_ponderado_pct`% en el medio, y a la derecha `ValidacionSelect` (si sos dirección) o un `Badge validacion-*` de solo lectura para cualquier otro rol. En mobile la fila pasa a columna (`flex-col` por debajo del breakpoint `sm`).

**`ValidacionSelect.tsx`**: el `<select>` reutiliza las mismas clases de borde/foco que `Input.tsx` (no el componente en sí — semánticamente es un elemento distinto, y no se agrega un componente `Select` nuevo para este spec), `Button variant="primary"` chico para "Guardar", mensaje de resultado debajo (error en `--color-risk-high`, éxito en `--color-risk-low`).

Las 4 pantallas son mobile-first — el prompt original lo pide explícito pensando en gerentes cargando datos desde el celular, y aunque la carga real es tema de 3b, no tiene sentido construir el shell/navbar de 3a de forma no-responsive para tener que rehacerlo en 3b.

## Archivos

**Nuevos:**
- `src/components/ui/Button.tsx`
- `src/components/ui/Field.tsx`
- `src/components/ui/Input.tsx`
- `src/components/ui/Card.tsx`
- `src/components/ui/Badge.tsx`

**Modificados:**
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/(app)/components/Navbar.tsx`
- `src/app/(app)/layout.tsx`
- `src/app/(app)/page.tsx`
- `src/app/(app)/sector/[slug]/page.tsx`
- `src/app/(app)/sector/[slug]/ValidacionSelect.tsx`
- `src/app/login/page.tsx`
- `src/app/login/LoginForm.tsx`

## Verificación

El proyecto no tiene (y nunca tuvo) suite de tests de UI — se verificó siempre con `npm run build` / `npx tsc --noEmit` más revisión manual, y este spec sigue esa misma convención. No hay herramienta de screenshot/browser disponible en el entorno de ejecución de Claude Code para este proyecto, así que la verificación visual final la hace el usuario corriendo `npm run dev` — el plan de implementación debe describir qué esperar en cada pantalla para que sea fácil de chequear a ojo.

Nada de este trabajo toca datos, auth o RLS — es puramente presentación sobre rutas ya construidas y probadas en Fase 2, así que el riesgo de regresión funcional es mínimo. El chequeo real es que `npm run build`/`tsc` sigan limpios y que las 5 pantallas se vean coherentes con la paleta/tipografía definida acá.
