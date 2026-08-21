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

  // Setup para los tests de INSERT: un puesto de Compras recién creado, sin
  // usar el que ya trae evaluación con id fijo (evita chocar con la unique
  // constraint (evaluacion_id, pregunta_id) de respuesta_pregunta).
  let scratchPuestoId, scratchEvaluacionId;
  await withRollback(async (client) => {
    const puestoRows = await client.query(
      `insert into puesto (sector_id, nombre, orden) values ($1, 'Puesto scratch RLS', 999) returning id`,
      [comprasSectorId]
    );
    scratchPuestoId = puestoRows.rows[0].id;
    const evalRows = await client.query(
      `insert into evaluacion (puesto_id) values ($1) returning id`,
      [scratchPuestoId]
    );
    scratchEvaluacionId = evalRows.rows[0].id;
  });
  if (!scratchPuestoId) {
    console.error("No se pudo crear el puesto scratch para los tests de INSERT (el setup corre sin RLS, revisar DATABASE_URL_OWNER vs DATABASE_URL).");
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

  // Los casos 8-12 prueban que las políticas de INSERT limitan quién puede insertar qué.
  // Ahora el rol puestos_clave_app SÍ tiene INSERT en puesto, evaluacion, respuesta_pregunta
  // y pregunta (migración 0010). Sin estas políticas, cualquier gerente podría insertar
  // en cualquier sector, y cualquiera podría insertar pregunta. Postgres rechaza por
  // políticas RLS (SQLSTATE 42501 si no hay match) después de confirmar permisos.

  // 8. Gerente de Compras INSERT puesto en su propio sector -> éxito
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    const { rows } = await client.query(
      `insert into puesto (sector_id, nombre, orden) values ($1, 'Puesto test', 998) returning id`,
      [comprasSectorId]
    );
    report("8. gerente Compras INSERT puesto en su propio sector", rows.length === 1);
  });

  // 9. Gerente de Compras INSERT puesto en Almacenes -> falla (42501, RLS)
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    try {
      const almacenesSector = await client.query(`select id from sector where slug = 'almacenes'`);
      await client.query(
        `insert into puesto (sector_id, nombre, orden) values ($1, 'Puesto test', 998) returning id`,
        [almacenesSector.rows[0].id]
      );
      report("9. gerente Compras NO puede INSERT puesto en Almacenes", false, "el insert tuvo éxito");
    } catch (error) {
      report("9. gerente Compras NO puede INSERT puesto en Almacenes", error.code === "42501", `code=${error.code}`);
    }
  });

  // 10. Dirección INSERT respuesta_pregunta en el puesto scratch -> éxito
  await withRollback(async (client) => {
    await setContext(client, { rol: "direccion", sectorId: null });
    const { rows } = await client.query(
      `insert into respuesta_pregunta (evaluacion_id, pregunta_id) values ($1, (select id from pregunta where numero = 1)) returning id`,
      [scratchEvaluacionId]
    );
    report("10. direccion puede INSERT respuesta_pregunta en cualquier sector", rows.length === 1);
  });

  // 11. Dirección INSERT pregunta (de puesto) -> éxito
  await withRollback(async (client) => {
    await setContext(client, { rol: "direccion", sectorId: null });
    const { rows } = await client.query(
      `insert into pregunta (numero, texto, ref_iso, peso_pct, puesto_id) values (11, 'Pregunta de prueba', '', 5, $1) returning id`,
      [scratchPuestoId]
    );
    report("11. direccion puede INSERT pregunta de puesto", rows.length === 1);
  });

  // 12. Gerente INSERT pregunta -> falla (solo direccion puede)
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    try {
      await client.query(
        `insert into pregunta (numero, texto, ref_iso, peso_pct, puesto_id) values (12, 'Pregunta de prueba', '', 5, $1) returning id`,
        [scratchPuestoId]
      );
      report("12. gerente NO puede INSERT pregunta", false, "el insert tuvo éxito");
    } catch (error) {
      report("12. gerente NO puede INSERT pregunta", error.code === "42501", `code=${error.code}`);
    }
  });

  // 13. UPDATE sobre sector (tabla de sólo lectura para el rol) -> 42501
  await withRollback(async (client) => {
    await setContext(client, { rol: "direccion", sectorId: null });
    try {
      await client.query("update sector set nombre = 'x' where id = $1", [comprasSectorId]);
      report("13. UPDATE en sector rechazado por falta de grant", false, "el update tuvo éxito");
    } catch (error) {
      report("13. UPDATE en sector rechazado por falta de grant", error.code === "42501", `code=${error.code}`);
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
