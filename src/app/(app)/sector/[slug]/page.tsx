import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { Card } from "@/components/ui/Card";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { AnimatedHeadline } from "@/components/ui/AnimatedHeadline";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { ValidacionSelect } from "./ValidacionSelect";
import { PuestoEvaluacionForm } from "./PuestoEvaluacionForm";

type PuestoRow = {
  evaluacion_id: string;
  puesto_nombre: string;
  puntaje_ponderado_pct: number;
  clasificacion: string;
  nivel_riesgo: string;
  semaforo: string;
  validacion_direccion: string;
  evaluador: string | null;
  fecha_evaluacion: string | null;
};

type PreguntaRow = {
  evaluacion_id: string;
  pregunta_id: string;
  numero: number;
  texto: string;
  ref_iso: string;
  peso_pct: string; // columna numeric — pg la devuelve como string, ver Global Constraints
  puntaje: number | null;
  justificacion: string | null;
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

  const isDireccion = session.user.esDireccion;
  const isOwnSector = session.user.sectoresGerente.includes(sector.id);

  // Sin rol gerente de ESTE sector ni rol dirección, forzando la URL
  // directa (la navbar de layout.tsx ya no le muestra el link, pero eso no
  // basta como protección — hay que rechazarlo también acá, server-side).
  if (!isOwnSector && !isDireccion) {
    notFound();
  }

  const puestos = await query<PuestoRow>(
    `select evaluacion_id, puesto_nombre, puntaje_ponderado_pct, clasificacion, nivel_riesgo, semaforo,
            validacion_direccion, evaluador, to_char(fecha_evaluacion, 'YYYY-MM-DD') as fecha_evaluacion
     from vista_evaluacion_calculada
     where sector_id = $1
     order by puesto_nombre`,
    [sector.id]
  );

  const preguntasPorEvaluacion = new Map<string, PreguntaRow[]>();
  if (isOwnSector) {
    const evaluacionIds = puestos.map((p) => p.evaluacion_id);
    const preguntaRows = await query<PreguntaRow>(
      `select rp.evaluacion_id, pr.id as pregunta_id, pr.numero, pr.texto, pr.ref_iso, pr.peso_pct,
              rp.puntaje, rp.justificacion
       from respuesta_pregunta rp
       join pregunta pr on pr.id = rp.pregunta_id
       where rp.evaluacion_id = any($1::uuid[])
       order by rp.evaluacion_id, pr.numero`,
      [evaluacionIds]
    );
    for (const row of preguntaRows) {
      const existentes = preguntasPorEvaluacion.get(row.evaluacion_id) ?? [];
      existentes.push(row);
      preguntasPorEvaluacion.set(row.evaluacion_id, existentes);
    }
  }

  return (
    <div>
      <AnimatedHeadline text={sector.nombre} className="mb-4 text-xl font-bold text-primary" />
      <div className="flex flex-col gap-3">
        {puestos.map((p) =>
          isOwnSector ? (
            <AnimatedCard key={p.evaluacion_id}>
            <Card>
              <details open={puestos.length === 1}>
                <summary className="cursor-pointer">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium text-text">{p.puesto_nombre}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={RIESGO_VARIANT[p.nivel_riesgo] ?? "validacion-pendiente"}>
                        {p.clasificacion}
                      </Badge>
                      <span className="text-sm text-text-muted">{p.puntaje_ponderado_pct}%</span>
                    </div>
                    <Badge variant={VALIDACION_VARIANT[p.validacion_direccion] ?? "validacion-pendiente"}>
                      {p.validacion_direccion}
                    </Badge>
                  </div>
                </summary>
                <PuestoEvaluacionForm
                  evaluacionId={p.evaluacion_id}
                  slug={slug}
                  evaluador={p.evaluador}
                  fechaEvaluacion={p.fecha_evaluacion}
                  preguntas={(preguntasPorEvaluacion.get(p.evaluacion_id) ?? []).map((row) => ({
                    preguntaId: row.pregunta_id,
                    numero: row.numero,
                    texto: row.texto,
                    refIso: row.ref_iso,
                    pesoPct: Number(row.peso_pct),
                    puntaje: row.puntaje,
                    justificacion: row.justificacion,
                  }))}
                />
              </details>
            </Card>
            </AnimatedCard>
          ) : (
            <AnimatedCard key={p.evaluacion_id}>
            <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            </AnimatedCard>
          )
        )}
      </div>
    </div>
  );
}
