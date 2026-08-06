import type { PoolClient } from "pg";
import { pool } from "./pool";

export interface AppUserContext {
  id: string;
  rol: "gerente" | "direccion";
  sectorId: string | null;
}

export async function withUserContext<T>(
  user: AppUserContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("select set_config($1,$2,true)", ["app.user_id", user.id]);
    await client.query("select set_config($1,$2,true)", ["app.rol", user.rol]);
    await client.query("select set_config($1,$2,true)", ["app.sector_id", user.sectorId ?? ""]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
