import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
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
    <main>
      <h1>{sector.nombre}</h1>
      <ul>
        {puestos.map((p) => (
          <li key={p.evaluacion_id}>
            <span>{p.puesto_nombre}</span>
            <span>
              {p.semaforo} {p.clasificacion} ({p.puntaje_ponderado_pct}%)
            </span>
            {isDireccion ? (
              <ValidacionSelect
                evaluacionId={p.evaluacion_id}
                estadoActual={p.validacion_direccion}
                slug={slug}
              />
            ) : (
              <span>{p.validacion_direccion}</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
