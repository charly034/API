import express from "express";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;

const app = express();

/* =========================
   CONFIG GENERAL
========================= */
app.use(express.json());

// ⚠️ Ajustá el dominio si querés restringir CORS
app.use(
  cors({
    origin: "*", // luego podés poner ["https://tudominio.com"]
  })
);

/* =========================
   POSTGRES CONNECTION
========================= */
const pool = new Pool({
  host: process.env.DB_HOST, // ej: postgresql
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME, // laquinta_db
  user: process.env.DB_USER, // laquinta
  password: process.env.DB_PASSWORD,
  ssl: false, // true solo si usás SSL
});

/* =========================
   HEALTH CHECK
========================= */
app.get("/health", async (_req, res) => {
  try {
    const r = await pool.query("SELECT now() AS now");
    res.json({ ok: true, db_time: r.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "DB connection failed" });
  }
});

/* =========================
   GET PEDIDOS
========================= */
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
});

/* =========================
   INSERT PEDIDO
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

    const q = `
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
      RETURNING id
    `;

    const values = [
      id,
      fecha,
      hora,
      String(telefono),
      nombre,
      direccion || null,
      modalidad,
      productos,
    ];

    const r = await pool.query(q, values);

    res.json({
      ok: true,
      inserted: r.rowCount === 1,
      id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar pedido" });
  }
});

/* =========================
   SERVER START
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 API La Quinta corriendo en puerto ${PORT}`);
});
