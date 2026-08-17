export interface PerfilAcceso {
  rol: "gerente" | "direccion";
  accesoExtendido: boolean;
}

// Decisión puntual de negocio, no una regla genérica: hoy solo RRHH y SIG y
// Medio Ambiente tienen accesoExtendido=true (ver scripts/seed-users.mjs).
// Dirección siempre puede ver todo por su rol, sin necesitar el flag.
export function puedeVerTodo(user: PerfilAcceso): boolean {
  return user.rol === "direccion" || user.accesoExtendido;
}
