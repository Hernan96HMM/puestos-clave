import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

let passed = 0;
let failed = 0;

function report(name, ok, detail) {
  if (ok) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.error(`FAIL: ${name}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function withRollback(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function setContext(client, { rol, sectorId }) {
  await client.query("select set_config($1,$2,true)", [
    "app.user_id",
    "00000000-0000-0000-0000-000000000000",
  ]);
  if (rol !== undefined) {
    await client.query("select set_config($1,$2,true)", ["app.rol", rol]);
  }
  if (sectorId !== undefined) {
    await client.query("select set_config($1,$2,true)", ["app.sector_id", sectorId ?? ""]);
  }
}

async function main() {
  const setupClient = await pool.connect();
  let comprasEvaluacionId, comprasSectorId, almacenesEvaluacionId;
  try {
    const compras = await setupClient.query(
      `select e.id as evaluacion_id, p.sector_id
       from evaluacion e join puesto p on p.id = e.puesto_id join sector s on s.id = p.sector_id
       where s.slug = 'compras' limit 1`
    );
    comprasEvaluacionId = compras.rows[0].evaluacion_id;
    comprasSectorId = compras.rows[0].sector_id;

    const almacenes = await setupClient.query(
      `select e.id as evaluacion_id
       from evaluacion e join puesto p on p.id = e.puesto_id join sector s on s.id = p.sector_id
       where s.slug = 'almacenes' limit 1`
    );
    almacenesEvaluacionId = almacenes.rows[0].evaluacion_id;
  } finally {
    setupClient.release();
  }

  // 1. Gerente de Compras escribe respuesta_pregunta de un puesto de Compras -> éxito
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    const { rows } = await client.query(
      `update respuesta_pregunta
       set puntaje = 3
       where evaluacion_id = $1 and pregunta_id = (select id from pregunta where numero = 1)
       returning id`,
      [comprasEvaluacionId]
    );
    report("1. gerente Compras escribe su propio sector", rows.length === 1);
  });

  // 2. Gerente de Compras escribe respuesta_pregunta de un puesto de Almacenes -> falla
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    const { rows } = await client.query(
      `update respuesta_pregunta
       set puntaje = 3
       where evaluacion_id = $1 and pregunta_id = (select id from pregunta where numero = 1)
       returning id`,
      [almacenesEvaluacionId]
    );
    report("2. gerente Compras NO puede escribir sector ajeno (Almacenes)", rows.length === 0);
  });

  // 3. Dirección intenta escribir respuesta_pregunta -> falla
  await withRollback(async (client) => {
    await setContext(client, { rol: "direccion", sectorId: null });
    const { rows } = await client.query(
      `update respuesta_pregunta
       set puntaje = 3
       where evaluacion_id = $1 and pregunta_id = (select id from pregunta where numero = 1)
       returning id`,
      [comprasEvaluacionId]
    );
    report("3. direccion NO puede escribir respuesta_pregunta", rows.length === 0);
  });

  // 4. Dirección escribe validacion_puesto -> éxito
  await withRollback(async (client) => {
    await setContext(client, { rol: "direccion", sectorId: null });
    const { rows } = await client.query(
      `update validacion_puesto set estado = 'aprobado' where evaluacion_id = $1 returning id`,
      [comprasEvaluacionId]
    );
    report("4. direccion puede escribir validacion_puesto", rows.length === 1);
  });

  // 5. Gerente intenta escribir validacion_puesto -> falla
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    const { rows } = await client.query(
      `update validacion_puesto set estado = 'aprobado' where evaluacion_id = $1 returning id`,
      [comprasEvaluacionId]
    );
    report("5. gerente NO puede escribir validacion_puesto", rows.length === 0);
  });

  // 6. Sin set_config (contexto vacío) -> cualquier escritura falla
  await withRollback(async (client) => {
    const { rows } = await client.query(
      `update respuesta_pregunta
       set puntaje = 3
       where evaluacion_id = $1 and pregunta_id = (select id from pregunta where numero = 1)
       returning id`,
      [comprasEvaluacionId]
    );
    report("6. sin contexto, escritura falla (default deny)", rows.length === 0);
  });

  // 7. SELECT funciona igual con o sin contexto
  await withRollback(async (client) => {
    const { rows } = await client.query("select count(*) from respuesta_pregunta");
    report("7. SELECT funciona sin contexto", Number(rows[0].count) > 0);
  });

  // Los casos 8 y 9 no prueban políticas RLS sino los GRANT del rol
  // puestos_clave_app: aunque una política dejara pasar la fila, el rol no tiene
  // INSERT en ninguna tabla ni UPDATE sobre sector/puesto/pregunta. Sin estos
  // casos, agregar un `insert` de más a la migración 0006 pasaría inadvertido.
  // Postgres rechaza por privilegios (SQLSTATE 42501) antes de evaluar RLS.

  // 8. INSERT en respuesta_pregunta (el rol no tiene grant de INSERT) -> 42501
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    try {
      await client.query(
        `insert into respuesta_pregunta (evaluacion_id, pregunta_id, puntaje)
         values ($1, (select id from pregunta where numero = 1), 3)`,
        [comprasEvaluacionId]
      );
      report("8. INSERT en respuesta_pregunta rechazado por falta de grant", false, "el insert tuvo éxito");
    } catch (error) {
      report(
        "8. INSERT en respuesta_pregunta rechazado por falta de grant",
        error.code === "42501",
        `code=${error.code}`
      );
    }
  });

  // 9. UPDATE sobre sector (tabla de sólo lectura para el rol) -> 42501
  await withRollback(async (client) => {
    await setContext(client, { rol: "direccion", sectorId: null });
    try {
      await client.query("update sector set nombre = 'x' where id = $1", [comprasSectorId]);
      report("9. UPDATE en sector rechazado por falta de grant", false, "el update tuvo éxito");
    } catch (error) {
      report("9. UPDATE en sector rechazado por falta de grant", error.code === "42501", `code=${error.code}`);
    }
  });

  await pool.end();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
