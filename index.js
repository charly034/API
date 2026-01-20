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
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false, // si usás un Postgres externo tipo Neon/Supabase, esto suele ir true/require
});

// Log de configuración (sin password) para debug en EasyPanel
console.log("📦 DB config:", {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
});

// Endpoint para testear DB rápidamente
app.get("/db", async (_req, res) => {
  try {
    const r = await pool.query("SELECT 1 as ok");
    res.json({ ok: true, db: r.rows[0].ok });
  } catch (e) {
    console.error("DB test error:", {
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
      hint: e?.hint,
      where: e?.where,
    });
    res.status(500).json({ ok: false, error: e?.message });
  }
});

// Obtener pedidos
app.get("/pedidos", async (_req, res) => {
  try {
    const q = `
      SELECT
        id,
        to_char(fecha, 'DD/MM/YYYY') AS fecha,
        to_char(hora, 'HH24:MI:SS') AS hora,
        telefono,
        nombre,
        direccion,
        modalidad,
        productos
      FROM pedidos
      ORDER BY fecha DESC, hora DESC
      LIMIT 100
    `;
    const r = await pool.query(q);
    res.json(r.rows);
  } catch (e) {
    console.error("GET /pedidos error:", {
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
      hint: e?.hint,
      where: e?.where,
    });
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
      INSERT INTO pedidos (id, fecha, hora, telefono, nombre, direccion, modalidad, productos)
      VALUES ($1, to_date($2,'DD/MM/YYYY'), $3::time, $4, $5, $6, $7, $8)
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
    ]);

    res.json({ ok: true, id });
  } catch (e) {
    console.error("POST /pedidos error:", {
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
      hint: e?.hint,
      where: e?.where,
    });
    res.status(500).json({ error: "Error al guardar pedido" });
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
        productos TEXT NOT NULL
      );
    `;
    await pool.query(q);
    res.json({ ok: true });
  } catch (e) {
    console.error("POST /setup error:", {
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
      hint: e?.hint,
      where: e?.where,
    });
    res.status(500).json({ ok: false, error: e?.message });
  }
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API La Quinta corriendo en puerto ${PORT}`);
});

// cierre prolijo
process.on("SIGTERM", async () => {
  try {
    await pool.end();
  } catch {}
  process.exit(0);
});

process.on("SIGINT", async () => {
  try {
    await pool.end();
  } catch {}
  process.exit(0);
});
