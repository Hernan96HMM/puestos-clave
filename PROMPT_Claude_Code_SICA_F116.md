# PROMPT PARA CLAUDE CODE — Plataforma web "F-116: Sistema de Gestión de Puestos Clave" (SICA)

Copiá y pegá todo este documento como prompt inicial en Claude Code (terminal, VS Code o el desktop app). Está escrito para que Claude Code pueda arrancar el proyecto de punta a punta sin tener que volver a preguntarte por la estructura de datos, porque esa estructura ya fue extraída de los 13 Excel reales del proyecto.

---

## 0. Contexto

SICA usa un formulario llamado **F-116 · Sistema de Gestión de Puestos Clave**, distribuido hoy como 13 archivos Excel (uno por sector + un archivo maestro). Cada gerente de sector completa, para cada puesto de su equipo, una evaluación de 10 preguntas ponderadas (0 a 5, o N/A). El Excel calcula automáticamente un puntaje ponderado, una clasificación del puesto y un nivel de riesgo ante vacante. Hay un archivo `F116_MAESTRO_Consolidado.xlsx` que junta todo en una tabla consolidada y un dashboard de KPIs.

Quiero migrar esto a una **aplicación web** donde:
- Cada gerente **solo pueda editar los datos de su propio sector** (formulario de carga).
- Exista un panel **MAESTRO** con dashboard ejecutivo (KPIs, gráficos, semáforo) con la info consolidada de todos los sectores.
- Una **navbar / sistema de tabs** permita navegar por cada sector y ver las respuestas ya cargadas por ese sector, en **modo solo lectura** (nadie puede editar el sector de otro).

Construí la aplicación completa: modelo de datos, backend, autenticación con roles, frontend con el diseño detallado más abajo, y carga de los datos reales que te indico en la sección 2 (son los mismos 76 puestos que hoy están en los Excel).

---

## 1. Roles y permisos

| Rol | Puede editar | Puede ver |
|---|---|---|
| **Gerente de sector** | Únicamente los puestos de SU sector asignado | Su propio sector (editable) + el resto de sectores en modo solo lectura + el dashboard MAESTRO |
| **Dirección / Admin** | Nada de los formularios (no carga puntajes), pero SÍ puede marcar la columna "Validación de Dirección" de cada puesto (aprobado / observado / pendiente) | Todo: dashboard MAESTRO, consolidado general y los 11 sectores en solo lectura |

Cada usuario (gerente) se autentica y queda **atado a un único sector** (relación 1 a 1 usuario-sector). El rol Admin/Dirección no está atado a ningún sector.

Implementar auth con roles y protección de rutas server-side (no solo ocultar botones en el cliente: si un gerente de "Compras" intenta hacer POST a un puesto de "Obras", el backend debe rechazarlo).

---

## 2. Modelo de datos (extraído de los Excel reales — usar esto tal cual)

### 2.1 Sectores y sus puestos

Hay **11 sectores**, cada uno corresponde a un archivo Excel y a una pestaña con el nombre del sector. Estos son los sectores con la cantidad real de puestos y sus nombres exactos (usalos para el seed / datos de carga inicial):

1. **Admin. y Finanzas** (6 puestos): Responsable de Administración, Contador Sr., Encargada de Facturación y Cobranza, Encargado de Tesorería, Auxiliar de Administración, Auxiliar de Administración 2
2. **Compras** (2 puestos): Comprador Sr., Comprador Jr.
3. **Comercial** (6 puestos): Responsable Comercial Unidad de Negocios Oil & Gas, Responsable Comercial Unidad de Negocios GLP y Gases del Aire, Ingeniero Comercial Unidad de Negocios Internacionales, Ing. de Presupuesto, Encargado de Presupuesto, Analista de Comercial y Presupuesto
4. **Control de Calidad** (11 puestos): Responsable Control de Calidad, Asistente Administrativo Calidad, Inspector de Soldadura, Inspector Senior, Inspector Semi Senior, Inspector Junior, Inspector Talleres externos, Responsable de Radiología (N2), Radiólogo (N1), Operador autorizado, Ayudante de Radiología
5. **Ingeniería** (10 puestos): Responsable de diseño mecánico y de equipos móviles, Responsable de ingeniería de obras, Responsable de Instrumentación y Electricidad, Responsable de Ingeniería de Equipos Oil & Gas y Especiales, Proyectista Senior, Instrumentista industrial, Ingeniero de Procesos, Proyectista Sr., Asistente de Documentación, Auxiliar de Instrumentación
6. **Mantenimiento** (7 puestos): Auxiliar Administrativo de Mantenimiento - Senior, Auxiliar Administrativo de Mantenimiento - Junior, Mantenimiento Eléctrico, Mantenimiento Mecánico de Vehículo, Mantenimiento Mecánico, Tornero, Operario de Mantenimiento electromecánico
7. **Obras** (3 puestos): Coordinador de Obras, Operario Calificado de Obras, Ayudante Calificado de Obras
8. **Planificación Operativa** (11 puestos): Jefe Calderería, Jefe de Pintura y Montaje, Encargado de Producción de Equipos móviles, Encargado de Tanques en serie, Encargado de Obras, Encargado de Mantenimiento Mecánico y Eléctrico, Auxiliar Administrativo de Mantenimiento, Auxiliar Administrativo de Producción, Analista Programador Cortes, Encargado de Almacenes, Líder de Proyecto
9. **Radiología** (3 puestos): Radiólogo (N1), Operador autorizado, Ayudante de Radiología
10. **Recursos Humanos** (5 puestos): Responsable Administrativo de Recursos Humanos, Generalista de Recursos Humanos, Encargado de Guardia, Personal de Guardia (Turnos rotativos), Personal de Maestranza
11. **SIG y Medio Ambiente** (8 puestos): Asistente de Gestión de Calidad, Asistente de Higiene y Seguridad Ocupacional, Responsable externo de Higiene y seguridad ocupacional, Asistente de Sistema Informático, Analista Funcional de Sistema informático, Responsable de Medicina Laboral, Servicio Médico de la Empresa, Servicio Medio Ambiental
12. **Almacenes** (4 puestos): Responsable de Almacenes, Auxiliar de Recepción de Materiales, Auxiliar Operativo de Almacén, Servicio de Cadetería

> Nota: "Radiología" está duplicado como sub-listado dentro de "Control de Calidad" (los últimos 4 puestos de Calidad son de radiología). Respetalo tal cual está en el Excel — son sectores organizativos separados aunque compartan nombres de puesto.

### 2.2 Banco de preguntas (idéntico en los 12 sectores, no cambia)

Cada puesto se evalúa con las mismas **10 preguntas ponderadas** (el peso total suma 100%):

| N° | Peso | Ref. ISO 9001:2015 | Pregunta |
|---|---|---|---|
| 1 | 12% | 5.1.1 / 9.1.3 | Impacto del puesto en la toma de decisiones y en los resultados (financieros, de procesos o de clima laboral). |
| 2 | 12% | 4.4 / 8.1 | Nivel de criticidad del rol: dependencia de otras áreas y capacidad de destrabar procesos. |
| 3 | 12% | 7.1.6 | Complejidad y tiempo de aprendizaje del conocimiento requerido (escasez en el mercado, curva de aprendizaje). |
| 4 | 10% | 5.1.1 / 6.1 | Impacto estratégico en el negocio: incidencia directa en clientes, costos o resultados. |
| 5 | 8% | 7.2 | Valor agregado de las competencias específicas del puesto al proceso. |
| 6 | 8% | 6.3 | Alineación con el futuro del negocio (digitalización, profesionalización, expansión). |
| 7 | 10% | 7.1.2 | Disponibilidad de reemplazo interno o polivalencia para cubrir el puesto. |
| 8 | 10% | 6.1 | Riesgo de impacto operativo inmediato ante una ausencia o desvinculación inesperada. |
| 9 | 10% | 7.2 / 8.1 | Requiere una matrícula profesional, certificación técnica o habilitación específica que no cualquier persona del mercado posee. |
| 10 | 8% | 4.2 / 9.2 | Interactúa con partes interesadas externas críticas (clientes, proveedores estratégicos, organismos de control) cuya gestión inadecuada afecta el cumplimiento o la relación. |

### 2.3 Entidades sugeridas (schema)

```
Sector
 - id, nombre, slug

Usuario
 - id, nombre, email, rol ("gerente" | "direccion"), sector_id (null si rol=direccion)

Puesto
 - id, sector_id, nombre, orden

Pregunta   (banco fijo, no editable desde la UI)
 - id, numero (1-10), texto, ref_iso, peso_pct

Evaluacion   (una por Puesto)
 - id, puesto_id
 - evaluador (texto libre o FK a Usuario)
 - fecha_evaluacion
 - validacion_direccion ("pendiente" | "aprobado" | "observado")
 - actualizado_en

RespuestaPregunta
 - id, evaluacion_id, pregunta_id
 - puntaje (0-5 o null = "N/A")
 - justificacion (texto, obligatorio si puntaje >= 3)
```

Los campos calculados (**no se guardan editables, se recalculan siempre en backend**):
- `puntaje_ponderado_pct` = Σ( (puntaje/5) × peso_pct ) sobre las preguntas respondidas (excluir N/A del cálculo, tal como hace el Excel).
- `clasificacion`:
  - `>= 70%` → **"PUESTO CLAVE"**
  - `50% – 69%` → **"PUESTO DE ATENCIÓN"**
  - `< 50%` → **"NO ES PUESTO CLAVE"**
- `nivel_riesgo`: ALTO / MEDIO / BAJO (según la misma clasificación de arriba).
- `semaforo`: 🔴 ALTO, 🟡 MEDIO, 🟢 BAJO.

### 2.4 Validación de negocio a respetar

- Si `puntaje` es 0, 1 o 2 → `justificacion` es opcional.
- Si `puntaje` es 3, 4 o 5 → `justificacion` es **obligatoria** (bloquear el guardado/submit si falta).
- El gerente evalúa el **puesto**, no a la persona (dejalo como texto de ayuda/tooltip en el formulario, igual que la hoja "Instrucciones" del Excel).
- Escala visible en el formulario: 0 = No aplica el criterio, 1 = Muy bajo, 2 = Bajo, 3 = Medio, 4 = Alto, 5 = Muy alto, N/A = la pregunta no corresponde a este puesto.

---

## 3. Mapa de navegación / páginas

1. **`/login`** — autenticación.
2. **`/dashboard`** (panel **MAESTRO**, visible para todos los roles autenticados) — landing post-login:
   - KPIs arriba: total de puestos evaluados, cantidad de "Puesto Clave", % sobre el total, cantidad "Puesto de Atención".
   - Gráfico de torta/dona: distribución Puesto Clave / Puesto de Atención / No es Puesto Clave.
   - Gráfico de barras: cantidad de puestos clave por sector.
   - Tabla "Consolidado General" (igual a la hoja del Excel): N°, Sector, Puesto, Evaluador, Fecha, Puntaje ponderado, Clasificación, Riesgo, Semáforo, Validación de Dirección. Ordenable y filtrable por sector/clasificación.
3. **Navbar / tabs por sector** (persistente, con los 12 sectores de la sección 2.1):
   - Si el usuario logueado es el gerente dueño de ese sector → la vista es **editable** (formulario de carga, un bloque colapsable por puesto, igual al Excel).
   - Para cualquier otro usuario (otro gerente o Dirección) → la misma info pero **100% solo lectura**, sin inputs, sin botón guardar.
   - Dirección ve, además, un control para cambiar `validacion_direccion` por puesto (aprobado/observado/pendiente), en cualquier sector.
4. **`/sector/[slug]`** — ruta real detrás de cada tab.
5. Página **404 personalizada** (ver sección de diseño).

---

## 4. Diseño — usar este stack de referencia e inspiración

- **Giros / micro-interacciones**: inspirate en **supahero.io**
- **Navbar**: inspirate en **navbar.gallery** (la navbar con tabs de sectores debe sentirse fluida, con indicador activo animado)
- **Secciones del dashboard**: layout tipo **bento grid**, inspirado en **bentogrids.com** (KPIs y gráficos en tarjetas de distintos tamaños)
- **Headlines**: inspirate en **h1gallery.com** para el título del dashboard MAESTRO y de la landing/login
- **CTAs**: inspirate en **cta.gallery** para botones de "Guardar evaluación", "Cargar puesto", etc.
- **Footer**: inspirate en **footer.design**
- **Página 404**: inspirate en **404s.design**
- **Iconografía**: usar **icoon.co** como fuente de iconos (o un set consistente equivalente si no hay MCP directo, ej. `lucide-react`)

**MCP disponibles — usarlos activamente durante el desarrollo:**
- **Magic UI (21st.dev)**: para componentes UI animados (cards, marquee, efectos de texto, bento grids animados).
- **Stitch**: para generación/exploración de layouts o assets de diseño donde aplique.

**Animación (obligatorio):**
- Efectos de **texto animado** en headlines (ej. reveal por letra/palabra, gradient text animado) usando Magic UI o Framer Motion.
- **Animaciones on-scroll** (fade/slide-in de las cards de KPIs, del bento grid del dashboard, de los bloques de puestos al hacer scroll dentro del formulario de un sector).
- Transición animada al cambiar de tab/sector en la navbar.
- Micro-interacciones en el semáforo (pulso sutil en rojo/alto riesgo) y en los botones (hover/press) inspiradas en supahero.io.

**Paleta de colores "SICA":**
No tengo los códigos hex exactos de la marca SICA en este contexto. Como punto de partida, usar una paleta industrial/corporativa (azul marino profundo + acento naranja/ámbar para alertas de riesgo alto, grises neutros para fondo) y dejarla **centralizada en variables de Tailwind/CSS** (`tailwind.config` o `globals.css`) para poder reemplazarla en 5 minutos apenas se tengan los hex reales del manual de marca. Nombrar las variables semánticamente: `--sica-primary`, `--sica-secondary`, `--sica-accent`, `--riesgo-alto`, `--riesgo-medio`, `--riesgo-bajo`.

---

## 5. Stack técnico sugerido

- **Next.js 14+ (App Router) + TypeScript**
- **Tailwind CSS + shadcn/ui** como base de componentes
- **Framer Motion** para las animaciones de scroll y texto
- **Supabase** (ya disponible como conector) para:
  - Auth (email/password o magic link) con roles custom (`gerente` / `direccion`) y `sector_id`
  - Postgres como base de datos, con **Row Level Security**: un gerente solo puede hacer INSERT/UPDATE en `evaluacion` / `respuesta_pregunta` de puestos cuyo `sector_id` coincida con su propio `sector_id`. Lectura (`SELECT`) abierta a todos los usuarios autenticados.
- **Recharts** (o similar, compatible con shadcn/ui charts) para los gráficos del dashboard MAESTRO.

---

## 6. Plan de implementación sugerido (fases)

1. **Setup del proyecto**: Next.js + TS + Tailwind + shadcn/ui + Framer Motion + conexión a Supabase.
2. **Modelo de datos**: crear las tablas de la sección 2.3 en Supabase (SQL migration), con RLS por sector.
3. **Seed de datos**: cargar los 12 sectores, sus puestos (nombres exactos de la sección 2.1) y el banco de 10 preguntas (sección 2.2) — dejar los puntajes vacíos, listos para que cada gerente los complete.
4. **Auth + roles**: login, sesión, middleware que resuelve el rol y el sector del usuario, protección de rutas server-side.
5. **Formulario de sector (editable)**: un bloque colapsable por puesto con las 10 preguntas, validación de justificación obligatoria (puntaje ≥ 3), cálculo en vivo del puntaje ponderado al ir completando, guardado.
6. **Vista de sector (solo lectura)**: mismo layout que el formulario pero sin inputs, con badges de clasificación/riesgo y semáforo.
7. **Dashboard MAESTRO**: KPIs, gráficos, tabla consolidada con filtros, columna de Validación de Dirección editable solo para el rol Dirección.
8. **Navbar con tabs animadas** para navegar entre los 12 sectores + dashboard.
9. **Pulido visual**: aplicar el stack de diseño de la sección 4 (headlines animados, bento grid, CTAs, footer, 404, iconografía, paleta SICA como variables reemplazables).
10. **Responsive** completo (mobile-first para los gerentes que puedan cargar datos desde el celular).

---

## 7. Entregable esperado

Un repo Next.js funcional, con:
- Login funcionando con al menos un usuario de prueba por rol (`gerente` de un sector de ejemplo + `direccion`).
- Los 12 sectores y sus puestos reales precargados (sección 2.1).
- Formulario de carga funcionando end-to-end con cálculo automático y validaciones.
- Dashboard MAESTRO con datos reales de ejemplo (podés generar 5-10 evaluaciones de muestra con puntajes variados para que el dashboard no se vea vacío).
- Diseño aplicando el stack de inspiración indicado, con animaciones de texto y de scroll.

Empezá por el setup del proyecto y el modelo de datos (fases 1 a 3), mostrame el resultado, y seguimos con auth y las vistas.
