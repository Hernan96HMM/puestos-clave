export interface PerfilAcceso {
  esDireccion: boolean;
}

// Con roles múltiples (perfil_rol, Fase 3d), tener el rol dirección ya da
// acceso a todo — no hace falta un flag aparte como el acceso_extendido
// de Fase 3c (retirado en esta fase).
export function puedeVerTodo(user: PerfilAcceso): boolean {
  return user.esDireccion;
}
