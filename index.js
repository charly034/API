import "dotenv/config";
import express from "express";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;
const app = express();

app.use(express.json());

// CORS simple (si después querés restringir dominios, lo ajustamos)
app.use(cors({ origin: "*" }));

// ✅ Healthchecks rápidos (para EasyPanel)
app.get("/", (_req, res) => res.status(200).send("OK"));
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));

// Postgres (no lo uses en healthcheck)
// Detección automática: prioriza `DATABASE_URL`, detecta host remoto
// cuando `DB_HOST` no es localhost. Se puede forzar con `DB_FORCE_LOCAL`
// o `DB_FORCE_REMOTE`. Maneja `ssl` a partir de `DB_SSL` o del host.

let pool = null;

function isTruthyEnv(v) {
  return !!v && ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function isLocalHost(h) {
  if (!h) return false;
  return ["localhost", "127.0.0.1"].includes(String(h).toLowerCase());
}

const forceLocal = isTruthyEnv(process.env.DB_FORCE_LOCAL);
const forceRemote = isTruthyEnv(process.env.DB_FORCE_REMOTE);
const hasDatabaseUrl = !!process.env.DATABASE_URL;
const hasHost = !!process.env.DB_HOST;
const detectedRemote =
  hasDatabaseUrl || (hasHost && !isLocalHost(process.env.DB_HOST));
// Priorizar local: usar remoto solo en development por defecto,
// a menos que se fuerce con DB_FORCE_REMOTE o se fuerce local con DB_FORCE_LOCAL.
const isDev = (process.env.NODE_ENV || "").toLowerCase() === "development";
const useRemote = forceRemote || (!forceLocal && isDev && detectedRemote);

// Calcular SSL (prioridad a DB_SSL). Por defecto no SSL para hosts locales.
const _dbSslEnv = (process.env.DB_SSL || "").toString().toLowerCase();
const defaultSsl = !!(hasDatabaseUrl && !isLocalHost(process.env.DB_HOST));
const useSsl = _dbSslEnv
  ? ["1", "true", "yes", "on"].includes(_dbSslEnv)
  : defaultSsl;

// Config básica (se adaptará según variables disponibles)
const config = {
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
    ? String(process.env.DB_PASSWORD)
    : undefined,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
};

// Inicializar pool tanto para local como remoto (pero solo si corresponde usar DB)
if (!useRemote) {
  console.log("ℹ️  Priorizando DB local (modo producción por defecto)");
} else {
  console.log("ℹ️  Usando DB remota (development o forzado)");
}

pool = new Pool(config);

(async () => {
  try {
    await pool.query("SELECT 1");
    console.log(
      useRemote ? "✅ DB conectada (remota)" : "✅ DB conectada (local)",
    );
  } catch (err) {
    logDbError("DB conexión inicial", err);
    console.log(
      "⚠️  Error conectando a la DB — deshabilitando endpoints de DB",
    );
    try {
      await pool.end();
    } catch (e) {}
    pool = null;
  }
})();

// Log de configuración (sin password) para debug en EasyPanel
console.log("📦 DB config:", {
  host: config.host,
  port: config.port,
  database: config.database,
  user: config.user,
  usingDatabaseUrl: !!config.connectionString,
  ssl: !!config.ssl,
});

// Log de configuración (sin password) para debug en EasyPanel
console.log("📦 DB config:", {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
});

// Helpers
function logDbError(context, e) {
  const info = {
    message: e?.message,
    code: e?.code,
    detail: e?.detail,
    hint: e?.hint,
    where: e?.where,
  };
  console.error(`${context} error:`, info);
  return info;
}

function sendServerError(res, message = "Error interno") {
  return res.status(500).json({ error: message });
}

// Endpoint para testear DB rápidamente
app.get("/db", async (_req, res) => {
  try {
    const r = await pool.query("SELECT 1 as ok");
    res.json({ ok: true, db: r.rows[0].ok });
  } catch (e) {
    logDbError("DB test", e);
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// Obtener pedidos
app.get("/pedidos", async (_req, res) => {
  try {
    const q = `
      SELECT
        id,
        fecha,
        hora,
        telefono,
        nombre,
        direccion,
        modalidad,
         productos,
         estado
      FROM pedidos
      ORDER BY fecha DESC, hora DESC
      LIMIT 100
    `;
    const r = await pool.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error("GET /pedidos error:", e?.message);
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
});

// Crear pedido
app.post("/pedidos", async (req, res) => {
  try {
    const {
      id,
      fecha,
      hora,
      telefono,
      nombre,
      direccion,
      modalidad,
      productos,
      estado,
    } = req.body;

    if (
      !id ||
      !fecha ||
      !hora ||
      !telefono ||
      !nombre ||
      !modalidad ||
      !productos
    ) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const q = `
      INSERT INTO pedidos (id, fecha, hora, telefono, nombre, direccion, modalidad, productos, estado)
      VALUES ($1, to_date($2,'DD/MM/YYYY'), $3::time, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO NOTHING
    `;

    await pool.query(q, [
      id,
      fecha,
      hora,
      String(telefono),
      nombre,
      direccion || null,
      modalidad,
      productos,
      estado || null,
    ]);

    res.json({ ok: true, id });
  } catch (e) {
    logDbError("POST /pedidos", e);
    sendServerError(res, "Error al guardar pedido");
  }
});

// (Opcional) Endpoint para crear la tabla si no existe
// Útil para debug inicial. Podés borrarlo después.
app.post("/setup", async (_req, res) => {
  try {
    const q = `
      CREATE TABLE IF NOT EXISTS pedidos (
        id TEXT PRIMARY KEY,
        fecha DATE NOT NULL,
        hora TIME NOT NULL,
        telefono TEXT NOT NULL,
        nombre TEXT NOT NULL,
        direccion TEXT,
        modalidad TEXT NOT NULL,
        productos TEXT NOT NULL,
        estado TEXT
      );
    `;
    await pool.query(q);
    res.json({ ok: true });
  } catch (e) {
    logDbError("POST /setup", e);
    res.status(500).json({ ok: false, error: e?.message });
  }
});
// Obtener un pedido por id (útil para debug y ver por qué falta uno)
app.get("/pedidos/:id", async (req, res) => {
  try {
    if (!pool)
      return res.status(500).json({
        error:
          "DB no configurada. Crea un .env con DB_HOST/DB_NAME/DB_USER/DB_PASSWORD",
      });
    const { id } = req.params;
    const q = `SELECT id, fecha, hora, telefono, nombre, direccion, modalidad, productos, estado FROM pedidos WHERE id = $1 LIMIT 1`;
    const r = await pool.query(q, [id]);
    if (r.rowCount === 0)
      return res.status(404).json({ error: "Pedido no encontrado" });
    res.json({ ok: true, row: r.rows[0] });
  } catch (e) {
    logDbError("GET /pedidos/:id", e);
    sendServerError(res, "Error al obtener pedido");
  }
});
// actualizar estado de un pedido
app.put("/pedidos/:id/estado", async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!estado) {
      return res.status(400).json({ error: "Falta el campo 'estado'" });
    }

    const q = `UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *`;
    const r = await pool.query(q, [estado, id]);

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    res.json({ ok: true, row: r.rows[0] });
  } catch (e) {
    logDbError("PUT /pedidos/:id/estado", e);
    sendServerError(res, "Error al actualizar estado del pedido");
  }
});

// Iniciar servidor

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API La Quinta corriendo en puerto ${PORT}`);
});

// cierre prolijo
async function shutdown() {
  try {
    await pool.end();
    console.log("Pool de DB cerrado");
  } catch (err) {
    console.warn("Error al cerrar pool:", err?.message || err);
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
