import express from "express";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;

const app = express();

/* =========================
   CONFIG GENERAL
========================= */
app.use(express.json());
app.use(
  cors({
    origin: "*", // luego podés limitarlo a tu dominio
  })
);

/* =========================
   POSTGRES
========================= */
const pool = new Pool({
  host: process.env.DB_HOST, // ej: postgresql
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME, // laquinta_db
  user: process.env.DB_USER, // laquinta
  password: process.env.DB_PASSWORD,
  ssl: false,
});

/* =========================
   HEALTHCHECK
========================= */
app.get("/health", async (_req, res) => {
  try {
    const r = await pool.query("SELECT 1 AS ok");
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Healthcheck error:", err);
    res.status(500).json({ ok: false });
  }
});

/* =========================
   GET PEDIDOS
========================= */
app.get("/pedidos", async (_req, res) => {
  try {
    const query = `
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

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("GET /pedidos error:", err);
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
});

/* =========================
   POST PEDIDOS
========================= */
app.post("/pedidos", async (req, res) => {
  try {
    const {
      id,
      fecha, // DD/MM/YYYY
      hora, // HH:MM:SS
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

    const query = `
      INSERT INTO pedidos (
        id,
        fecha,
        hora,
        telefono,
        nombre,
        direccion,
        modalidad,
        productos
      )
      VALUES (
        $1,
        to_date($2, 'DD/MM/YYYY'),
        $3::time,
        $4,
        $5,
        $6,
        $7,
        $8
      )
      ON CONFLICT (id) DO NOTHING
    `;

    await pool.query(query, [
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
  } catch (err) {
    console.error("POST /pedidos error:", err);
    res.status(500).json({ error: "Error al guardar pedido" });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API La Quinta corriendo en puerto ${PORT}`);
});

/* =========================
   GRACEFUL SHUTDOWN
========================= */
process.on("SIGTERM", async () => {
  console.log("SIGTERM recibido. Cerrando servidor...");
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT recibido. Cerrando servidor...");
  await pool.end();
  process.exit(0);
});
