import express from "express";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
app.use(cors()); // luego lo restringimos a tu dominio
app.use(express.json());

// Variables de entorno en EasyPanel
const pool = new Pool({
  host: process.env.DB_HOST, // ej: "postgresql" (servicio interno en EasyPanel)
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME, // ej: "laquinta_db"
  user: process.env.DB_USER, // ej: "laquinta"
  password: process.env.DB_PASSWORD,
});

// Health
app.get("/health", async (_req, res) => {
  const r = await pool.query("SELECT now() AS now");
  res.json({ ok: true, now: r.rows[0].now });
});

// GET pedidos (últimos 100)
app.get("/pedidos", async (_req, res) => {
  const q = `
    SELECT
      id,
      to_char(fecha, 'DD/MM/YYYY') AS fecha,
      to_char(hora, 'HH24:MI:SS') AS hora,
      telefono, nombre, direccion, modalidad, productos
    FROM pedidos
    ORDER BY fecha DESC, hora DESC
    LIMIT 100
  `;
  const r = await pool.query(q);
  res.json(r.rows);
});

// POST pedido
app.post("/pedidos", async (req, res) => {
  const { id, fecha, hora, telefono, nombre, direccion, modalidad, productos } =
    req.body;

  const q = `
    INSERT INTO pedidos (id, fecha, hora, telefono, nombre, direccion, modalidad, productos)
    VALUES ($1, to_date($2,'DD/MM/YYYY'), $3::time, $4, $5, $6, $7, $8)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  `;

  const r = await pool.query(q, [
    id,
    fecha,
    hora,
    String(telefono),
    nombre,
    direccion,
    modalidad,
    productos,
  ]);

  res.json({ ok: true, inserted: r.rowCount === 1 });
});

app.listen(3000, () => console.log("API on :3000"));
