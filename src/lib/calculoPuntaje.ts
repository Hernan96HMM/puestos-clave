export interface RespuestaCalculo {
  peso_pct: number;
  puntaje: number | null;
}

// Replica la fórmula de vista_evaluacion_calculada (migración 0004):
// round(coalesce(sum(peso*puntaje) filter (donde respondida) / sum(peso) filter (donde respondida) / 5 * 100, 0), 1)
export function calcularPuntajePonderado(respuestas: RespuestaCalculo[]): number {
  const respondidas = respuestas.filter((r) => r.puntaje !== null);
  const pesoRespondido = respondidas.reduce((sum, r) => sum + r.peso_pct, 0);
  if (pesoRespondido === 0) return 0;
  const sumaPonderada = respondidas.reduce((sum, r) => sum + r.peso_pct * (r.puntaje as number), 0);
  return Math.round(((sumaPonderada / pesoRespondido / 5) * 100) * 10) / 10;
}
