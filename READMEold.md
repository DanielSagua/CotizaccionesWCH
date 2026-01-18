# Cotizaciones App (Solicitudes de Cotización)

Aplicación web interna para registrar, asignar y gestionar **solicitudes de cotización**, con **login por usuario**, **roles** (Vendedor/Jefe/Analista/Admin), **historial de cambios** (auditoría) y **comentarios** tipo chat.

---

## Stack

- **Backend:** Node.js + Express
- **BD:** SQL Server (paquete `mssql`)
- **Sesiones:** `express-session`
- **Frontend:** Nunjucks + Bootstrap 5.3 + JavaScript
- **Seguridad:** `helmet` (CSP desactivado por ahora)

---

## Requisitos

- Node.js **LTS** (recomendado 20+)
- SQL Server (Local/Remoto)
- SSMS o herramienta para ejecutar scripts SQL

---

## Instalación

```bash
npm install
```

---

## Variables de entorno (.env)

Crea un archivo `.env` en la raíz del proyecto (ejemplo):

```env
NODE_ENV=development
PORT=3000

SESSION_SECRET=una_clave_larga_y_segura

DB_SERVER=localhost
DB_PORT=1433
DB_NAME=CotizacionesDB
DB_USER=sa
DB_PASSWORD=TuPassword
DB_ENCRYPT=false
DB_TRUST_SERVER_CERT=true
```

> Ajusta `DB_*` según tu servidor SQL (local, red, hosting).

---

## Base de datos

### 1) Crear la base de datos
Ejecuta:

```sql
IF DB_ID(N'CotizacionesDB') IS NULL
BEGIN
  CREATE DATABASE [CotizacionesDB];
END
GO

USE [CotizacionesDB];
GO
```

### 2) Crear tablas principales
Ejecuta el script de esquema (tablas):
- `Users`
- `Solicitudes`
- `SolicitudesHistorial`
- `EstadosSolicitud` (catálogo de estados)

> Si no lo tienes en un solo archivo, ejecútalo según el orden en que lo hayas creado en el proyecto.

### 3) Crear tabla de comentarios
Ejecuta:

```sql
USE [CotizacionesDB];
GO

CREATE TABLE dbo.SolicitudesComentarios (
  id_comentario   INT IDENTITY(1,1) PRIMARY KEY,
  id_solicitud    INT NOT NULL,
  actor_user_id   INT NOT NULL,
  comentario      NVARCHAR(MAX) NOT NULL,
  created_at_utc  DATETIMEOFFSET(0) NOT NULL
    DEFAULT TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00'),
  CONSTRAINT FK_Com_Solicitud FOREIGN KEY (id_solicitud) REFERENCES dbo.Solicitudes(id_solicitud),
  CONSTRAINT FK_Com_Actor     FOREIGN KEY (actor_user_id) REFERENCES dbo.Users(id_user)
);

CREATE INDEX IX_Com_Solicitud ON dbo.SolicitudesComentarios(id_solicitud, created_at_utc DESC);
GO
```

---

## Ejecutar la app

### Modo desarrollo
```bash
npm run dev
```

La app quedará en:
- http://localhost:3000

---

## Roles y permisos

- **VENDEDOR**
  - Crea solicitudes
  - Ve sus solicitudes (owner)
  - Puede editar (según reglas del workflow)
- **ANALISTA**
  - Ve solicitudes asignadas
  - Puede comentar y cambiar estado (según workflow)
- **JEFE**
  - Ve todo
  - Asigna analistas
  - Puede cambiar estados y editar
- **ADMIN**
  - Acceso total
  - CRUD de usuarios

---

## Funcionalidades

### Solicitudes
- Listado con:
  - Tabs por rol (Todas / Mis solicitudes / Asignadas)
  - Filtros (cliente, asunto, estado, asignado)
  - Paginación (server-side)
- Crear solicitud (POST)
- Detalle de solicitud:
  - Datos principales
  - **Historial (auditoría)** con acciones: `CREATE`, `UPDATE`, `ASSIGN`, `CHANGE_STATUS`, `COMMENT`
  - **Comentarios** tipo chat

### Auditoría (Historial)
Cada cambio importante se registra en `SolicitudesHistorial` dentro de **la misma transacción** que el cambio de la solicitud.

### Exportación
- Export CSV (solo JEFE/ADMIN):  
  `GET /solicitudes/export.csv` (respeta filtros/tab)

### Admin (Usuarios)
- `GET /admin/users`
- Crear usuario
- Editar usuario
- Activar/Desactivar
- Reset de contraseña (modal)

---

## Rutas principales

### Auth
- `GET /login`
- `POST /login`
- `POST /logout`

### Solicitudes
- `GET /solicitudes`
- `GET /solicitudes/nueva`
- `POST /solicitudes`
- `GET /solicitudes/:id`
- `GET /solicitudes/:id/editar`
- `POST /solicitudes/:id/editar`
- `POST /solicitudes/:id/asignar` (JEFE/ADMIN)
- `POST /solicitudes/:id/estado` (ANALISTA/JEFE/ADMIN)
- `POST /solicitudes/:id/comentarios`
- `GET /solicitudes/export.csv` (JEFE/ADMIN)

### Admin
- `GET /admin/users`
- `GET /admin/users/nuevo`
- `POST /admin/users`
- `GET /admin/users/:id/editar`
- `POST /admin/users/:id/editar`
- `POST /admin/users/:id/toggle`
- `POST /admin/users/:id/reset-pass`

---

## Notas importantes

### CSP (Helmet)
Por ahora se usa:

```js
helmet({ contentSecurityPolicy: false })
```

Esto permite cargar Bootstrap desde CDN y ejecutar scripts inline del layout (toasts/validación).  
Luego se puede endurecer CSP con nonces/hashes.

### Orden de rutas
Las rutas fijas deben ir antes de rutas dinámicas. Ej:
`/solicitudes/export.csv` debe ir **antes** de `/solicitudes/:id`.

---

## Estructura (referencia)

```
src/
  app.js
  server.js
  config/
    db.js
  middlewares/
    auth.js
    roles.js
  modules/
    auth/
    solicitudes/
    admin/
views/
  layouts/
  pages/
public/
  css/
```

---

## Próximos pasos sugeridos

- Endurecer CSP (allowlist CDN + nonce)
- Logs de administración (historial de cambios en Users)
- Export Excel/PDF
- Notificaciones por correo (flag `.env`)

---
