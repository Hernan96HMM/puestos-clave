# Credenciales de prueba — Fase 2 / Fase 3c / Fase 3d

Generadas por `scripts/seed-users.mjs`. Son credenciales de **prueba/desarrollo**,
no de producción — cambiá las env vars `SEED_PASSWORD_*` antes de correr este
script contra cualquier ambiente real.

| Usuario | Email | Roles | Contraseña (default de desarrollo) |
|---|---|---|---|
| Gerente Compras | `compras@test.local` | gerente (Compras) | `Compras123!` |
| Gerente Almacenes | `almacenes@test.local` | gerente (Almacenes) | `Almacenes123!` |
| Dirección | `direccion@test.local` | direccion | `Direccion123!` |
| Gerente RRHH | `rrhh@test.local` | gerente (Recursos Humanos) + direccion | `RRHH123!` |
| Gerente SIG | `sig@test.local` | gerente (SIG y Medio Ambiente) + direccion | `Sig123!` |

Para usar contraseñas distintas, seteá `SEED_PASSWORD_GERENTE_COMPRAS`,
`SEED_PASSWORD_GERENTE_ALMACENES`, `SEED_PASSWORD_DIRECCION`,
`SEED_PASSWORD_GERENTE_RRHH`, `SEED_PASSWORD_GERENTE_SIG` antes de correr
`npm run db:seed-users` — si no están seteadas, usa los defaults de esta tabla.

Casos de uso:
- **Gerente Compras**: sector chico (2 puestos), rápido para probar el flujo
  de escritura editable.
- **Gerente Almacenes**: sector distinto, para el test cruzado de RLS (un
  gerente de un sector no puede escribir en otro).
- **Dirección**: sin sector, valida puestos de cualquier sector, ve todos
  los sectores y el dashboard MAESTRO.
- **Gerente RRHH / Gerente SIG** (Fase 3d — múltiples roles): un solo login
  con AMBOS roles a la vez. Editan su propio sector como gerente, y además
  pueden validar puestos de cualquier sector como dirección — no solo verlos,
  a diferencia del `acceso_extendido` de Fase 3c (retirado en Fase 3d).
