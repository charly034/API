import express from "express";
import cors from "cors";
import pkg from "pg";

const { Pool } = pkg;
const app = express();

app.use(express.json());
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
  ssl: false,
});

app.get("/pedidos", async (_req, res) => {
  try {
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error al obtener pedidos" });
  }
});

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
    console.error(e);
    res.status(500).json({ error: "Error al guardar pedido" });
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
