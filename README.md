# PARKCONTROL

Aplicación web para la gestión de estacionamiento construida para el proyecto final de Bases de Datos. Consume la base PostgreSQL existente y utiliza las funciones almacenadas `registrar_entrada` y `registrar_salida`; no modifica su estructura.

## Requisitos

- Node.js 18 o superior.
- PostgreSQL con la base restaurada desde `BD/dump-parkcontrol-202609142353.sql`.

## Ejecución

1. Configure las credenciales sin versionarlas:

   ```bash
   cd backend
   cp .env.example .env
   ```

   Edite `.env` y complete `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`.

2. Instale y ejecute el backend:

   ```bash
   npm install
   npm run dev
   ```

3. Abra `frontend/index.html` en el navegador. Para evitar restricciones de algunos navegadores al abrir archivos locales, también puede iniciarse un servidor estático desde la raíz:

   ```bash
   npx serve frontend
   ```

   La API estará disponible en `http://localhost:3000/api`.

## Endpoints

- `GET /api/dashboard`, `/clientes`, `/vehiculos`, `/espacios`, `/estadias`, `/estadias/activas`, `/pagos`.
- `POST` y `PUT` para `/api/clientes`, `/api/vehiculos` y `/api/espacios`; además de los catálogos `GET /api/tipos-vehiculo`, `/usuarios`, `/metodos-pago` y `/zonas`.
- `GET /api/reportes/ocupacion`, `/ingresos`, `/ingresos-metodo`, `/vehiculos-tipo`, `/estadias-estado`, `/ingresos-fecha` y `/historial`.
- `POST /api/entrada` con `placa`, `codigo_espacio`, `nombre_usuario`.
- `POST /api/salida` con `estadia_id`, `metodo_pago`.
