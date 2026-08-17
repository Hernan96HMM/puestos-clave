# Credenciales de prueba — Fase 2 / Fase 3c

Generadas por `scripts/seed-users.mjs`. Son credenciales de **prueba/desarrollo**,
no de producción — cambiá las env vars `SEED_PASSWORD_*` antes de correr este
script contra cualquier ambiente real.

| Usuario | Email | Rol | Sector | Acceso extendido | Contraseña (default de desarrollo) |
|---|---|---|---|---|---|
| Gerente Compras | `compras@test.local` | gerente | Compras | No | `Compras123!` |
| Gerente Almacenes | `almacenes@test.local` | gerente | Almacenes | No | `Almacenes123!` |
| Dirección | `direccion@test.local` | direccion | — | (no aplica, ya ve todo por rol) | `Direccion123!` |
| Gerente RRHH | `rrhh@test.local` | gerente | Recursos Humanos | Sí | `RRHH123!` |
| Gerente SIG | `sig@test.local` | gerente | SIG y Medio Ambiente | Sí | `Sig123!` |

Para usar contraseñas distintas, seteá `SEED_PASSWORD_GERENTE_COMPRAS`,
`SEED_PASSWORD_GERENTE_ALMACENES`, `SEED_PASSWORD_DIRECCION`,
`SEED_PASSWORD_GERENTE_RRHH`, `SEED_PASSWORD_GERENTE_SIG` antes de correr
`npm run db:seed-users` — si no están seteadas, usa los defaults de esta tabla.

Casos de uso:
- **Gerente Compras**: sector chico (2 puestos), rápido para probar el flujo
  de escritura editable.
- **Gerente Almacenes**: sector distinto, para el test cruzado de RLS (un
  gerente de un sector no puede escribir en otro).
- **Dirección**: sin sector, solo puede tocar `validacion_puesto`, ve todos
  los sectores y el dashboard MAESTRO.
- **Gerente RRHH / Gerente SIG**: acceso extendido (Fase 3c) — editan su
  propio sector, ven el resto en solo lectura, y ven el dashboard MAESTRO.
  Sirven para probar que un gerente con `acceso_extendido = true` ve más que
  uno sin él (ej. Compras), sin necesitar loguearse como Dirección.
