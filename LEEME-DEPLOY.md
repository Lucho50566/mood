# Subir MOOD a producción

**Respuesta corta:** sí, 1.000 cuentas es un tamaño chico. La app ya usa **SQLite con WAL**
(`node:sqlite`, sin dependencias) y sobra para el club: el benchmark con **1.000 socios y 12.000
reservas** dio una base de **2,5 MB**, búsquedas por teléfono en **0,01 ms** y la agenda completa
en **27 ms**. El verdadero límite no es la base: es **dónde vive el servidor** y su uptime.

## Qué necesitás

1. **Dominio** (ej. `mood.tuclub.com`) — ~USD 10/año.
2. **HTTPS** — obligatorio para instalar la PWA, usar la cámara y los webhooks de Mercado Pago.
3. **Node 24** (o 22.5+).
4. **Un lugar siempre encendido** y con internet: VPS o la PC del club.

---

## Opción A — VPS chico + dominio (recomendada)

Costo: **USD 4–6/mes** + dominio. Sirve Hetzner, DigitalOcean, Vultr o similar (1 vCPU / 1 GB sobra).

1. **DNS**: apuntá `mood.tuclub.com` (registro A) a la IP del VPS.
2. **Node 24** en Ubuntu 24:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt install -y nodejs
   ```
3. **Copiar la app** a `/opt/mood` y crear un usuario sin login:
   ```bash
   sudo mkdir -p /opt/mood
   sudo useradd -r -s /bin/false mood
   # subí el contenido de mood/ a /opt/mood
   sudo chown -R mood:mood /opt/mood
   ```
4. **Servicio**: copiá `deploy/mood.service` a `/etc/systemd/system/mood.service`, cambiá
   `PUBLIC_URL` por tu dominio y ejecutá:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now mood
   ```
5. **HTTPS con Caddy**:
   ```bash
   sudo apt install -y caddy
   sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # cambiá el dominio
   sudo systemctl reload caddy
   ```
6. Abrí `https://mood.tuclub.com`, creá tu usuario, entrá a **Admin** con PIN `1234` y cambialo.
7. **Mercado Pago**: Admin → Ajustes → pegá el **Access Token** de producción. La URL pública ya
   queda definida por `PUBLIC_URL`; el webhook es `https://mood.tuclub.com/api/mp/webhook`.
8. **Backup diario**:
   ```bash
   sudo crontab -e
   # 15 3 * * * cd /opt/mood && /usr/bin/node tools/backup.js
   ```
9. **Firewall**: dejá abiertos solo 22, 80 y 443. El puerto 4400 no hace falta exponerlo.

## Opción B — Docker (más fácil de mover)

```bash
cp .env.example .env      # completá PUBLIC_URL
docker compose up -d --build
```
Los datos quedan en `./data` (volumen). Poné Caddy/Nginx adelante para HTTPS.

## Opción C — PC del club + Cloudflare Tunnel (sin costo mensual)

Buena si querés que los datos queden en el club y no pagar VPS.

1. Instalá Node 24 en la PC.
2. Creá un **túnel nombrado** (URL fija):
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create mood
   cloudflared tunnel route dns mood mood.tuclub.com
   ```
3. Copiá `deploy/cloudflared-config.yml.example` a la config de cloudflared, completá UUID y rutas.
4. `cloudflared service install` (arranca solo).
5. Arrancá MOOD al iniciar Windows (Programador de tareas o NSSM) y definí
   `PUBLIC_URL=https://mood.tuclub.com`.
6. Configurá la PC para **no dormirse** y, si podés, una UPS.

Contras: si se corta la luz o internet, la app se cae. Para un club chico suele alcanzar; para
producción seria, VPS.

## Opción D — Render / Railway / Fly.io

- Necesitás **disco persistente** (SQLite no va en filesystem efímero).
- Render: Web Service + Disk montado en `/data` y `MOOD_DATA=/data`.
- Los planes gratis duermen o borran el disco: usá el plan pago más chico.
- Verificá que el disco sea local (no NFS) para evitar corrupción de SQLite.

---

## Capacidad real

| Escenario | Datos | Resultado |
|---|---|---|
| 1.000 socios + 12.000 reservas | 2,5 MB | consultas < 2 ms, agenda 27 ms |
| 5.000 socios + 60.000 reservas | ~12 MB | sigue sobrando |
| 10.000 socios + 500.000 reservas | ~100 MB | funciona con índices; conviene Postgres |

**Cuándo pasar a Postgres**: varias sucursales/clubes, varias instancias del servidor a la vez,
o reporting pesado. La capa de datos está aislada en `lib/store.js`, así que se cambia sin tocar
la PWA.

## Seguridad para producción

- HTTPS siempre (Caddy o Cloudflare).
- Cambiar el **PIN** inicial (`1234`) y no compartirlo.
- El **Access Token de MP** vive en el servidor; nunca en el navegador.
- Login de admin con límite de intentos (8 fallos → 10 minutos de bloqueo).
- Backups diarios fuera del servidor (Drive, S3, otro disco).
- Actualizar Node cuando salgan parches de seguridad.
- Los socios se identifican con **teléfono** (sin contraseña). Si querés más seguridad, el paso
  siguiente es un PIN por socio: se agrega sin cambiar la arquitectura.

## Checklist de lanzamiento

- [ ] Dominio apuntando al servidor
- [ ] HTTPS funcionando
- [ ] `PUBLIC_URL` configurada
- [ ] PIN de admin cambiado
- [ ] Access Token de MP cargado y **una compra de prueba** confirmada
- [ ] Backup manual (`node tools/backup.js`) y cron diario
- [ ] PWA instalada desde el celular (Chrome/Safari)
- [ ] Horarios reales de todas las clases cargados
