# MOOD · Training Club — PWA v2

App de turnos para el gym **MOOD Training Club** (La Consulta, Mendoza).
Ahora es una **PWA instalable** con **servidor propio**: todos los socios ven la misma agenda,
el club administra desde el celular y los pagos se confirman en el servidor.

- **Estética**: negro, blanco y magenta `#CC2299`, Archivo Black itálica.
- **Stack**: Node.js 24 sin dependencias (HTTP + API JSON + **SQLite** con `node:sqlite`) + PWA vanilla.
- **Puerto**: 4400.

## Qué se puede hacer

### Socios
- **Inicio**: próximo turno, novedades/flyers, clases de hoy/mañana, rutina y estado del abono.
- **Reservar**: día + actividad, cupos en vivo, reserva en 2 toques.
- **Mi rutina**: elegís tus clases fijas de la semana y **se reservan solas 2 semanas para adelante**
  (se renuevan automáticamente). Se puede editar o quitar cuando quieras.
- **Mis turnos**: código para recepción, Google Calendar y cancelación (con devolución de créditos).
- **Abonos**: pagar con **Mercado Pago** (Checkout Pro o link de pago) o avisar pago en efectivo.
- **Perfil**: datos, créditos, historial de pagos, instalar la app y modo administración.
- **Racha y logros** (v2.4): semanas seguidas entrenando, "Tu mes en MOOD" (clases, horas y
  actividad favorita) y 7 logros con progreso. Se calculan con los últimos 180 días de turnos.
- **Ticket animado** al reservar, con el color de la actividad y el código para recepción.

### Club (Admin, PIN `1234`)
- **Agenda** por día: reservas de cada clase, cupos y quitar reservas.
- **Socios**: buscar, cambiar abono, cargar/ajustar créditos.
- **Horarios**: alta/edición/baja y **generar bloques** (ej. 06:00 a 22:00 cada 60 min).
- **Clases**: crear/editar nombre, duración, créditos, color y visibilidad.
- **Cobros**: precios, créditos y **link de Mercado Pago por plan**; confirmar/rechazar pagos.
- **Difusión**: subir **flyers/novedades** con imagen, texto y botón. Aparecen en Inicio de todos.
- **Ajustes**: datos del club, **ventana de cancelación** (ej. 30 min), PIN, Mercado Pago y datos demo.

## Horarios cargados

- **7 clases**: Musculación, CrossFit, Endurance, Full Contact, Spinning, Jiu-Jitsu y Zumba.
- **Musculación** (turnos de 1 hora, cupo 25): lun–vie **06:00–11:00** y **14:00–22:30**;
  sábados **09:00–12:00** y **18:00–20:00**. Domingo cerrado.
- **Jiu-Jitsu** (90 min, cupo 20): **martes y jueves 18:30**.
- **CrossFit** (60 min, cupo 20): **lunes a viernes 20:00** y **martes/jueves 15:30**.
- **Endurance** (60 min, cupo 20): **lunes a viernes 20:00** y **martes/jueves 15:30**.
- **Spinning** (45 min, cupo 16): **lunes, miércoles y viernes 14:30 y 20:00**.
- **Full Contact** (60 min, cupo 16): **martes y jueves 21:00**.
- **Zumba** (60 min, cupo 20): **lunes y miércoles 19:00**.
- Las 7 clases ya tienen horarios, así que aparecen todas en la rutina.

## Arrancar

```
Iniciar Mood.bat        (o: node server.js)
```
Abre `http://localhost:4400`. Desde el celular en la misma WiFi, usá la IP que muestra el `.bat`.

### Instalar como app (PWA)

- **Android/Chrome**: abrir la URL → menú ⋮ → *Instalar aplicación*.
- **iPhone/Safari**: Compartir → *Agregar a pantalla de inicio*.
- La app queda con ícono propio, pantalla completa y funciona como app nativa.
- **Importante**: abrir la app por `http://192.168.x.x` **no permite instalarla**. El teléfono exige
  **HTTPS** (túnel o dominio). Tampoco la abras desde el navegador interno de Telegram/Instagram:
  usá Chrome o Safari.

> Para instalarla desde afuera de la red y para que Mercado Pago pueda avisar pagos,
> usá **`Compartir Mood (tunel).bat`**: levanta un túnel HTTPS (`trycloudflare.com`).
> Copiá esa URL en **Admin → Ajustes → URL pública**.

## Mercado Pago

Hay tres formas, de la más simple a la más automática:

1. **Link de pago por plan (simple)**: en Mercado Pago creá un link de pago y pegalo en
   **Admin → Cobros → Link de pago**. El socio toca *Pagar*, se abre MP y al volver avisa el pago;
   el club lo confirma desde **Cobros** y se activan los créditos.
2. **Checkout Pro automático**: en **Admin → Ajustes → Mercado Pago** cargá el **Access Token**
   (Credenciales de producción de tu aplicación) y la **URL pública** (túnel o dominio).
   La app crea la preferencia y el webhook `/api/mp/webhook` activa el abono solo.
3. **Efectivo**: el socio toca *Avisar pago* y el club confirma desde **Cobros**.

Con el túnel de Cloudflare la URL cambia cada vez que lo abrís; si vas a usar MP en serio,
conviene un dominio fijo (o un túnel nombrado).

## Datos

- Todo se guarda en **`data/db.sqlite`** (WAL, transacciones) y las imágenes en **`data/uploads/`**.
- Si venías de la versión anterior, el servidor **migra solo** `data/db.json` → SQLite la primera vez
  (deja `db.json.migrated` como respaldo).
- Backup: `node tools/backup.js` (copia consistente + imágenes, rota a 14 días).

## Pruebas

```
node tools/test-api.js       # 35 pruebas de API (usa datos temporales)
node tools/bench.js          # benchmark: 1.000 socios y 12.000 reservas
node tools/backup.js         # backup en backups/
```

## Estructura

```
mood/
  server.js          servidor HTTP + API + Mercado Pago
  lib/store.js       capa SQLite (node:sqlite)
  data/              db.sqlite + uploads
  web/               PWA
    index.html
    app.js           vistas, rutina, pagos, admin
    styles.css
    sw.js            service worker
    manifest.webmanifest
    img/ fonts/
  tools/             pruebas y capturas
  deploy/            systemd, Caddy, Cloudflare Tunnel
  Dockerfile         imagen Node 24
  LEEME-DEPLOY.md    guía para subirla a producción
  Iniciar Mood.bat
  Compartir Mood (tunel).bat
```
