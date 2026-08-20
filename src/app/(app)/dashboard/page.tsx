import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { puedeVerTodo } from "@/lib/permisos";
import { DashboardHeader, type KpiValores } from "./DashboardHeader";
import { DashboardCharts, type DistribucionClasificacion, type PuestosPorSector } from "./DashboardCharts";
import { TablaConsolidada, type ConsolidadoRow } from "./TablaConsolidada";

type KpiRow = { total: string; puesto_clave: string; puesto_atencion: string };
type DistribucionRow = { clasificacion: string; cantidad: string };
type PorSectorRow = { sector: string; cantidad: string };
type ConsolidadoDbRow = {
  evaluacion_id: string;
  sector: string;
  sector_slug: string;
  puesto_nombre: string;
  evaluador: string | null;
  fecha_evaluacion: string | null;
  puntaje_ponderado_pct: string;
  clasificacion: string;
  nivel_riesgo: string;
  semaforo: string;
  validacion_direccion: string;
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  if (!puedeVerTodo(session.user)) {
    // Sin rol dirección forzando la URL directamente — la navbar ya no le
    // muestra este link, pero hay que rechazarlo también acá.
    const propio = session.user.sectoresGerente[0];
    if (!propio) {
      // Sin ningún sector gerente tampoco: perfil sin roles asignados, ver
      // el mismo caso en (app)/page.tsx.
      return (
        <p className="text-sm text-text-muted">
          Tu usuario no tiene ningún rol asignado. Contactá a un administrador.
        </p>
      );
    }
    const rows = await query<{ slug: string }>("select slug from sector where id = $1", [propio]);
    redirect(`/sector/${rows[0]?.slug ?? ""}`);
  }

  const [kpiRows, distribucionRows, porSectorRows, consolidadoRows] = await Promise.all([
    query<KpiRow>(
      `select count(*) as total,
              count(*) filter (where clasificacion = 'PUESTO CLAVE') as puesto_clave,
              count(*) filter (where clasificacion = 'PUESTO DE ATENCIÓN') as puesto_atencion
       from vista_evaluacion_calculada`
    ),
    query<DistribucionRow>(
      `select clasificacion, count(*) as cantidad from vista_evaluacion_calculada group by clasificacion order by clasificacion`
    ),
    query<PorSectorRow>(
      `select s.nombre as sector, count(v.evaluacion_id) filter (where v.clasificacion = 'PUESTO CLAVE') as cantidad
       from sector s
       left join vista_evaluacion_calculada v on v.sector_id = s.id
       group by s.nombre, s.orden
       order by s.orden`
    ),
    query<ConsolidadoDbRow>(
      `select v.evaluacion_id, s.nombre as sector, s.slug as sector_slug, v.puesto_nombre, v.evaluador,
              to_char(v.fecha_evaluacion, 'YYYY-MM-DD') as fecha_evaluacion,
              v.puntaje_ponderado_pct, v.clasificacion, v.nivel_riesgo, v.semaforo, v.validacion_direccion
       from vista_evaluacion_calculada v
       join sector s on s.id = v.sector_id
       order by s.orden, v.puesto_nombre`
    ),
  ]);

  const total = Number(kpiRows[0]?.total ?? 0);
  const puestoClave = Number(kpiRows[0]?.puesto_clave ?? 0);
  const puestoAtencion = Number(kpiRows[0]?.puesto_atencion ?? 0);
  const kpis: KpiValores = {
    total,
    puestoClave,
    pctPuestoClave: total === 0 ? 0 : Math.round((puestoClave / total) * 1000) / 10,
    puestoAtencion,
  };

  const distribucion: DistribucionClasificacion[] = distribucionRows.map((r) => ({
    clasificacion: r.clasificacion,
    cantidad: Number(r.cantidad),
  }));
  const porSector: PuestosPorSector[] = porSectorRows.map((r) => ({
    sector: r.sector,
    cantidad: Number(r.cantidad),
  }));
  const consolidado: ConsolidadoRow[] = consolidadoRows.map((r) => ({
    ...r,
    puntaje_ponderado_pct: Number(r.puntaje_ponderado_pct),
  }));

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader kpis={kpis} />
      <DashboardCharts distribucion={distribucion} porSector={porSector} />
      <TablaConsolidada rows={consolidado} esDireccion={session.user.esDireccion} />
    </div>
  );
}
