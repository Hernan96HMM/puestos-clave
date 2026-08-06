# Credenciales de prueba — Fase 2

Generadas por `scripts/seed-users.mjs`. Son credenciales de **prueba/desarrollo**,
no de producción — cambiá las env vars `SEED_PASSWORD_*` antes de correr este
script contra cualquier ambiente real.

| Usuario | Email | Rol | Sector | Contraseña (default de desarrollo) |
|---|---|---|---|---|
| Gerente Compras | `compras@test.local` | gerente | Compras | `Compras123!` |
| Gerente Almacenes | `almacenes@test.local` | gerente | Almacenes | `Almacenes123!` |
| Dirección | `direccion@test.local` | direccion | — | `Direccion123!` |

Para usar contraseñas distintas, seteá `SEED_PASSWORD_GERENTE_COMPRAS`,
`SEED_PASSWORD_GERENTE_ALMACENES`, `SEED_PASSWORD_DIRECCION` antes de correr
`npm run db:seed-users` — si no están seteadas, usa los defaults de esta tabla.

Casos de uso:
- **Gerente Compras**: sector chico (2 puestos), rápido para probar el flujo
  de escritura editable.
- **Gerente Almacenes**: sector distinto, para el test cruzado de RLS (un
  gerente de un sector no puede escribir en otro).
- **Dirección**: sin sector, solo puede tocar `validacion_puesto`.
