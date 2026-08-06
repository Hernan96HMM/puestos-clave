import pg from "pg";

const connectionString = process.env.DATABASE_URL_OWNER;
const appPassword = process.env.POSTGRES_APP_PASSWORD;

if (!connectionString) {
  console.error("DATABASE_URL_OWNER is not set");
  process.exit(1);
}
if (!appPassword) {
  console.error("POSTGRES_APP_PASSWORD is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function main() {
  const client = await pool.connect();
  try {
    // ALTER ROLE ... PASSWORD does not accept query parameters the way DML
    // does. The value comes from our own env var, never from request input,
    // so this is not an injection risk — client.escapeLiteral() still quotes
    // it correctly for the statement.
    const escaped = client.escapeLiteral(appPassword);
    await client.query(`alter role puestos_clave_app with password ${escaped}`);
    console.log("puestos_clave_app password set.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
