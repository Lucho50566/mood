# Prompt para el video promo de la app MOOD (Remotion + Claude)

Copiá todo lo que está entre las dos líneas y pegámelo en una sesión de Claude Code
abierta en la carpeta donde quieras crear el proyecto de video.

---

Usá las skills de Remotion (remotion-best-practices, remotion-create, remotion-markup,
remotion-studio y remotion-render) para crear un video promocional vertical de la app
**MOOD · Training Club**, el gym de La Consulta, Mendoza.

## Objetivo
Que los socios del gym instalen la app en el celular y empiecen a reservar sus clases desde ahí.
Se va a publicar como Reel de Instagram, TikTok y estado de WhatsApp.

## Formato
- 1080×1920, 30 fps, **30 segundos** (900 frames).
- Además, una versión corta de **15 segundos** con las escenas 1, 3, 5 y 7.
- Exportar en MP4 (H.264) a `out/mood-promo-30s.mp4` y `out/mood-promo-15s.mp4`.

## Material (está todo en `C:\Users\ezequ\.openclaw\workspace\mood`)
Copiá estos archivos a `public/` del proyecto Remotion:
- Logo: `web/img/logo.jpg` (circular, fondo negro).
- Tipografía: `web/fonts/archivo-black.woff2` (Archivo Black, siempre en **itálica** y MAYÚSCULAS para títulos).
- Capturas reales de la app (390×844 a 2x, o sea 780 px de ancho):
  - `promo/inicio-pantalla.png`: Inicio con el próximo turno y la racha.
  - `promo/inicio.png`: Inicio completo (alto, ideal para un scroll animado).
  - `promo/reservar.png`: agenda del día con cupos en vivo y colores por actividad.
  - `promo/ticket.png`: ticket "CONFIRMADO" después de reservar.
  - `promo/turnos.png`: Mis turnos con el código para recepción.
  - `promo/perfil.png`: Perfil con racha, "Tu mes en MOOD" y logros.

## Identidad visual
- Fondo negro `#0B0B0B` con un brillo magenta difuso arriba a la derecha.
- Color principal magenta `#CC2299` (variantes `#E62BAB` y `#FF4FBD`), blanco `#F7F7F8`.
- Títulos en Archivo Black itálica, mayúsculas, interletrado apretado.
- Motivo de la marca: etiquetas blancas con texto magenta en itálica (como "TU MES EN MOOD").
- Movimiento enérgico pero limpio: entradas con easing exponencial (`cubic-bezier(.16,1,.3,1)`),
  revelados con máscara de izquierda a derecha y una leve inclinación (skew) que sigue la itálica.
  Nada de rebotes ni efectos elásticos.
- Mostrar las capturas dentro de un **celular dibujado con CSS** (bordes redondeados, marco negro
  fino y sombra suave). No uses imágenes de teléfonos de marcas reales.

## Guion (30 s)
Los textos van en español rioplatense, cortos y en mayúsculas cuando son títulos.

1. **0–3 s · Gancho.** Fondo negro. El logo entra girando y escalando, y "MOOD" se revela con una máscara
   de izquierda a derecha. Debajo, "TRAINING CLUB" con interletrado amplio.
   Texto grande: **"¿TODAVÍA RESERVÁS POR WHATSAPP?"**
2. **3–7 s · La app.** El celular sube desde abajo mostrando `inicio-pantalla.png`.
   Texto: **"TU GYM EN EL CELULAR"**.
3. **7–12 s · Reservar.** Cambiá a `reservar.png` y animá un toque (un círculo que se encoge)
   sobre un botón RESERVAR. Texto: **"RESERVÁ EN 2 TOQUES"** y más chico "Cupos en vivo, sin mensajes".
4. **12–16 s · El ticket.** Mostrá `ticket.png` con un zoom suave hacia el ticket y un destello
   magenta cuando aparece el sello CONFIRMADO. Texto: **"TU LUGAR, CONFIRMADO"** y "Mostrá el código en recepción".
5. **16–21 s · Racha.** Recortá la tarjeta "6 SEMANAS SEGUIDAS" de `perfil.png` y agrandala.
   Animá las 8 barras inclinadas llenándose una por una en magenta.
   Texto: **"SUMÁ SEMANAS. NO CORTES LA RACHA."**
6. **21–25 s · Rutina y pagos.** Scroll rápido de `inicio.png` mientras pasan tres frases:
   "Tu rutina se reserva sola" · "Pagá tu abono con Mercado Pago" · "Desbloqueá logros".
7. **25–30 s · Cierre.** Fondo negro con el brillo magenta, logo centrado y botón magenta
   **"INSTALÁ LA APP"**. Debajo, el link: **[PEGAR ACÁ EL LINK HTTPS DE LA APP]**
   y "@[PEGAR ACÁ EL INSTAGRAM DEL GYM]". Terminá con el logo latiendo una sola vez.

## Audio
- Dejá preparada una pista de música en `public/musica.mp3` (la pongo yo; tiene que ser libre de derechos).
- Marcá los cortes de escena con un golpe de sonido corto si hay un archivo `public/hit.mp3`.
  Si no existe, que el video funcione igual sin sonido.

## Cómo quiero trabajar
1. Creá el proyecto, armá cada escena como un componente separado y mostrámelo en Remotion Studio.
2. Esperá mis cambios antes de renderizar.
3. Cuando lo apruebe, renderizá las dos versiones y decime dónde quedaron.

---

## Antes de pegarlo
- Reemplazá **[PEGAR ACÁ EL LINK HTTPS DE LA APP]** por la URL pública (dominio o túnel).
- Reemplazá **[PEGAR ACÁ EL INSTAGRAM DEL GYM]** por la cuenta real.
- Si cambiás algo de la app, regenerá las capturas antes de hacer el video.
