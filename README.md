# La Quinta - API

Pequeña API Express con conexión a PostgreSQL. Soporta conexión local y remota y detecta automáticamente el modo. Este README explica instalación, variables de entorno, comportamiento de detección y endpoints.

**Requisitos**

- Node.js 18+ (probado con Node 22)
- PostgreSQL (local o remoto)

**Instalación**

```bash
npm install
```

**Scripts**

- `npm run dev` — arranca con `nodemon` (recomendado durante desarrollo)
- `npm start` — arranca con `node index.js`

**Variables de entorno**

La app carga `.env` (usa `dotenv`). Variables principales:

- `DATABASE_URL` — URL completa de conexión PostgreSQL. (Ej: `postgres://user:pass@host:5432/dbname?sslmode=require`)
- `DB_HOST` — host de la BD (ej `localhost` o `mi-host.com`)
- `DB_PORT` — puerto (por defecto `5432`)
- `DB_NAME` — nombre de la base de datos
- `DB_USER` — usuario
- `DB_PASSWORD` — contraseña
- `DB_SSL` — forzar SSL (`1`, `true`, `yes`) o `false` para desactivar
- `DB_FORCE_LOCAL` — si `1` fuerza usar la configuración local
- `DB_FORCE_REMOTE` — si `1` fuerza usar la configuración remota
- `NODE_ENV` — `development` o `production`. Por defecto la app prioriza local; la remota se usa automáticamente sólo si `NODE_ENV=development` (a menos que se fuerce)
- `PORT` — puerto de la app (por defecto `3000`)

Ejemplo mínimo de `.env`:

```dotenv
# Conexion por DATABASE_URL (remota)
DATABASE_URL=postgres://usuario:password@193.203.174.156:5432/laquinta_DB?sslmode=disable

# O configuración por partes (local)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=laquinta_DB
DB_USER=usuario_local
DB_PASSWORD=pass_local
DB_SSL=false

PORT=3000
```

**Comportamiento de detección local vs remota**

- La app prioriza la BD local en entornos no `development` (producción) para evitar usar la remota accidentalmente.
- Si `NODE_ENV=development` y existe `DATABASE_URL` o un `DB_HOST` que no sea `localhost`/`127.0.0.1`, la app usará la remota.
- Podés forzar comportamiento con `DB_FORCE_LOCAL=1` o `DB_FORCE_REMOTE=1`.
- SSL se detecta desde `DB_SSL` o desde la presencia de `DATABASE_URL`/host remoto; también puede forzarse con `DB_SSL=1`.

**Endpoints**

- GET `/` — health simple (200 OK)
- GET `/health` — { ok: true }
- GET `/db` — prueba rápida a la BD, devuelve `{ ok: true, db: 1 }` si funciona
- GET `/pedidos` — obtiene los últimos 100 pedidos
- POST `/pedidos` — crea un pedido. Body JSON: `{ id, fecha, hora, telefono, nombre, direccion?, modalidad, productos }` (fecha formato `DD/MM/YYYY`)
- GET `/pedidos/:id` — obtiene pedido por id
- POST `/setup` — crea la tabla `pedidos` si no existe (útil para debug)

**Comandos de prueba**

PowerShell:

```powershell
# Probar health
wget -UseBasicParsing -Uri http://localhost:3000/

# Probar /db
wget -UseBasicParsing -Uri http://localhost:3000/db -OutFile -
```

Linux/macOS (curl):

```bash
curl http://localhost:3000/db
```

**Notas y troubleshooting**

- Asegurate de que el `.env` esté presente y con las credenciales correctas.
- Si la app falla por `Cannot find package 'dotenv'`, ejecuta `npm i dotenv`.
- Si quieres ver si la app está usando la BD local o remota, revisa los logs al arrancar; el arranque informa `Priorizando DB local` o `Usando DB remota` y muestra la configuración (sin password).
- Para forzar reconexiones o reintentos automáticos, se puede mejorar el código adicionando lógica de reintento/expBackoff (no incluido por defecto).

**Contribuir / Cambios**

Si querés que agregue:

- Endpoint que devuelva explícitamente `mode: "local"|"remote"`.
- Reintentos automáticos de conexión.
- Tests unitarios o integración.

Abrí un issue o pedime que lo implemente y lo agrego.

---

Archivo principal: [index.js](index.js)
