import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { ValidacionSelect } from "./ValidacionSelect";

type PuestoRow = {
  evaluacion_id: string;
  puesto_nombre: string;
  puntaje_ponderado_pct: number;
  clasificacion: string;
  nivel_riesgo: string;
  semaforo: string;
  validacion_direccion: string;
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

  const puestos = await query<PuestoRow>(
    `select evaluacion_id, puesto_nombre, puntaje_ponderado_pct, clasificacion, nivel_riesgo, semaforo, validacion_direccion
     from vista_evaluacion_calculada
     where sector_id = $1
     order by puesto_nombre`,
    [sector.id]
  );

  const isDireccion = session.user.rol === "direccion";

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-primary">{sector.nombre}</h1>
      <div className="flex flex-col gap-3">
        {puestos.map((p) => (
          <Card
            key={p.evaluacion_id}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
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
        ))}
      </div>
    </div>
  );
}
