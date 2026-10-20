# Pantalla

Se carga al trabajar en `src/`. Cómo se escribe lo que ve el analista está
en el CLAUDE.md de la raíz («Lo que ve el analista pasa por la revisión de
UX»); acá, las piezas y lo que costó caro aprender. La pestaña y el botón de
Equifax: `docs/equifax.md`. El Laboratorio: `docs/laboratorio-guia.md`,
«Cómo está construido».

## Dónde está cada cosa

- `src/lib/fechas.js` — el único lugar donde se formatean fechas.
  Ecuador es UTC-5 sin horario de verano; a las 20:00 de Ecuador la
  fecha UTC ya es la de mañana.
- `src/lib/paginar.js` → `traerTodas()` — la forma de leer más de 1.000
  filas desde el navegador. PostgREST corta ahí sin avisar: Costos sumó
  1.000 de 1.006 llamadas hasta el 2026-09-24. Pagina hasta el conteo de
  la primera página, no hasta una página corta, y pide un orden total
  (desempate por id) en el que lo insertado durante la lectura caiga al
  final.
- `src/lib/navegacion.js` — la estructura de la aplicación: de ahí salen el
  menú lateral y la ubicación "Sección › Página" de la barra superior. Un
  nombre del menú se cambia ahí, no en dos listas.
- `src/lib/formatos.js`, `src/lib/mensajesDeError.js` y
  `src/components/ui/` — cómo se escribe un número, qué se le dice a la
  persona cuando algo falla y las piezas que comparten las pantallas.
- `.claude/skills/revision-ux/` — la revisión de UX: flujo, glosario con el
  porqué, mapa de pantallas, criterios y un verificador para el navegador de
  QA. Se corre al cambiar una pantalla.

## Lo que costó caro aprender

**Interfaz** (revisión del 2026-10-10, `docs/revision-ux.md`)
- Una pantalla que espera la sesión no es una pantalla sin sesión:
  `App.jsx` espera `loading`; si no, un enlace directo cae en
  `*` → /login → "/" y el expediente no sobrevive a una recarga.
- El perfil de acceso se pide una vez (`useProfile`). Una guardia de ruta no
  devuelve `null` mientras carga: una pantalla de administración quedaba en
  blanco de 4 a 10 s.
- Una franja de totales suma, y una barra mide lo que dice su título.
- Un texto que la clasificación guardó con formato de JavaScript ("el corte
  2026-08", "$1084") se muestra con `humanizarTexto()`; no se reescriben
  miles de perfiles por un problema de presentación.
- Las pantallas que documentan reglas (Reglas de clasificación) se desfasan
  en silencio: la nuestra decía fuentes-v9 con el código en v10.
- Vite puede servir un módulo viejo tras ediciones seguidas del mismo archivo
  (`Link is not defined` con el import presente): `touch` y recargar.
- Una pantalla que pide varias cosas pesadas no depende de la más lenta: lo
  liviano decide si se dibuja, lo pesado llega después y cada tarjeta dice qué
  le falta (Laboratorio › Inicio, `lab_centro_de_datos`: unos 6 s sola
  hasta la 121, 28 ms desde la 125).
- El tamaño de la aplicación se mide con el `.env`: sin las variables de
  Supabase, `supabaseClient.js` exporta `null` y el compilador deja afuera el
  cliente (~200 KB). Una carpeta sin `.env` (un worktree) y la integración
  continua miden 273 KB donde lo publicado pesa 476 KB.
- Debajo de 860 px las tarjetas desplazan lo que les sobra (`overflow-x: auto`)
  y recortan lo que sale de ellas: `InfoTooltip` dibuja la burbuja en el body,
  con posición fija. Hasta el 2026-10-17, en una tableta o un teléfono no se
  leía ninguna ayuda de la pestaña Equifax. Algo que flota (menú, aviso) va igual.
- `.oxlintrc.json` activa `no-undef` en `src/` (2026-10-17): ni el lint sin
  configuración ni el build ven una variable sin definir, y una que quedó suelta
  tras un renombre tumbó el reporte de Equifax en producción con los cuatro
  controles en verde.
