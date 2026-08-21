import { Card } from "@/components/ui/Card";

const PASOS = [
  {
    titulo: "PASO 1",
    texto: "Busque la pestaña con el nombre de SU sector (abajo, entre las solapas del archivo).",
  },
  {
    titulo: "PASO 2",
    texto:
      'Dentro de esa pestaña va a ver un bloque separado para cada puesto de su equipo. Cada bloque ya tiene el nombre del puesto escrito arriba, en "Puesto evaluado".',
  },
  {
    titulo: "PASO 3",
    texto: "En cada bloque, complete primero: Evaluador (su nombre) y Fecha de evaluación.",
  },
  {
    titulo: "PASO 4",
    texto:
      'Responda las 10 preguntas de ese bloque. Para cada una, coloque un puntaje de 0 a 5 (o "N/A" si esa pregunta no aplica a ese puesto). Importante: está evaluando el PUESTO, no a la persona. Pregúntese: "¿si mañana lo ocupara otra persona, esta respuesta cambiaría?". Si cambia mucho, está evaluando desempeño individual, no el puesto — eso no es lo que buscamos acá.',
  },
  {
    titulo: "PASO 4-bis",
    texto:
      "Al lado de cada puntaje hay una columna “Justificación / Evidencia”: si el puntaje es 0, 1 o 2 puede dejarla en blanco; si el puntaje es 3, 4 o 5 es OBLIGATORIO escribir una justificación breve (el hecho concreto que sostiene ese puntaje).",
  },
  {
    titulo: "PASO 5",
    texto:
      'No toque nada más. El "Puntaje ponderado (%)", la "Clasificación" y el "Nivel de riesgo" se completan solos, automáticamente, al pie de cada bloque.',
  },
  {
    titulo: "PASO 6",
    texto: "Repita los pasos 3 a 5 con cada puesto de su sector, uno por bloque, hasta terminar todos.",
  },
  {
    titulo: "PASO 7",
    texto: "Guarde. El consolidado general y el dashboard se actualizan solos con lo que usted cargó.",
  },
];

const PREGUNTAS = [
  { n: "Q1", peso: "12%", texto: "Impacto del puesto en la toma de decisiones y en los resultados (financieros, de procesos o de clima laboral)." },
  { n: "Q2", peso: "12%", texto: "Nivel de criticidad del rol: dependencia de otras áreas y capacidad de destrabar procesos." },
  { n: "Q3", peso: "12%", texto: "Complejidad y tiempo de aprendizaje del conocimiento requerido (escasez en el mercado, curva de aprendizaje)." },
  { n: "Q4", peso: "10%", texto: "Impacto estratégico en el negocio: incidencia directa en clientes, costos o resultados." },
  { n: "Q5", peso: "8%", texto: "Valor agregado de las competencias específicas del puesto al proceso." },
  { n: "Q6", peso: "8%", texto: "Alineación con el futuro del negocio (digitalización, profesionalización, expansión)." },
  { n: "Q7", peso: "10%", texto: "Disponibilidad de reemplazo interno o polivalencia para cubrir el puesto." },
  { n: "Q8", peso: "10%", texto: "Riesgo de impacto operativo inmediato ante una ausencia o desvinculación inesperada." },
  { n: "Q9", peso: "10%", texto: "Requiere una matrícula profesional, certificación técnica o habilitación específica que no cualquier persona del mercado posee." },
  { n: "Q10", peso: "8%", texto: "Interactúa con partes interesadas externas críticas (clientes, proveedores estratégicos, organismos de control) cuya gestión inadecuada afecta el cumplimiento o la relación." },
];

export function InstruccionesTab() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-primary">Objetivo</h2>
        <p className="text-sm text-text">
          Identificar, de manera objetiva y homogénea, los puestos críticos de la organización — aquellos cuya
          vacante repentina generaría el mayor impacto en resultados, procesos o cumplimiento normativo —
          independientemente de quién ocupe el puesto en la actualidad.
        </p>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-primary">Paso a paso — qué tengo que hacer</h2>
        <ol className="flex flex-col gap-3">
          {PASOS.map((paso) => (
            <li key={paso.titulo}>
              <p className="text-sm text-text">
                <span className="font-semibold text-secondary">{paso.titulo} → </span>
                {paso.texto}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-primary">Escala de puntuación</h2>
        <p className="text-sm text-text">
          0 = No aplica el criterio · 1 = Muy bajo · 2 = Bajo · 3 = Medio · 4 = Alto · 5 = Muy alto · N/A = la
          pregunta no corresponde a este puesto.
        </p>
        <p className="mt-3 text-sm font-medium text-text">Resultado según el puntaje total (lo calcula el archivo solo):</p>
        <ul className="mt-1 flex flex-col gap-1 text-sm text-text-muted">
          <li>70% o más → PUESTO CLAVE (riesgo ALTO si queda vacante)</li>
          <li>50% a 69% → PUESTO DE ATENCIÓN (riesgo MEDIO)</li>
          <li>menos de 50% → NO ES PUESTO CLAVE (riesgo BAJO)</li>
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-primary">Las 10 preguntas y su peso (igual en todos los sectores; Dirección puede sumar preguntas puntuales a un puesto específico)</h2>
        <ol className="flex flex-col gap-2">
          {PREGUNTAS.map((p) => (
            <li key={p.n} className="text-sm text-text">
              <span className="font-semibold text-secondary">
                {p.n} ({p.peso})
              </span>{" "}
              — {p.texto}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
