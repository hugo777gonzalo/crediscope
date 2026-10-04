// Gráficos del Laboratorio, en SVG propio: líneas (ROC, KS, supervivencia,
// calibración), barras (histogramas, tasas por tramo), cajas, mapa de calor
// y dispersión. Sin librería de gráficos: son pocos tipos, y así respetan
// los colores de la aplicación y no suman peso. Cada punto lleva su valor en
// un <title> (se ve al pasar el mouse).

const ANCHO = 640;
export const PALETA = ["var(--brand)", "var(--bad)", "var(--good)", "var(--warn)", "#0f766e", "#be185d", "var(--gold)", "#64748b"];

// Marcas "redondas" del eje (1, 2, 5 × 10^k).
export function marcas(min, max, cuantas = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const crudo = (max - min) / cuantas;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const error = crudo / potencia;
  const paso = (error >= 7.5 ? 10 : error >= 3.5 ? 5 : error >= 1.5 ? 2 : 1) * potencia;
  const salida = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max + paso * 1e-9; v += paso) salida.push(Number(v.toPrecision(12)));
  return salida;
}

const formatoPorDefecto = (v) => (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("es-EC") : String(Number(v.toPrecision(4))).replace(".", ","));

function Ejes({ x, y, alto, margen, xMarcas, yMarcas, escX, escY, formatoX, formatoY }) {
  const derecha = ANCHO - margen.derecha, abajo = alto - margen.abajo;
  return (
    <g style={{ fontSize: 11, fill: "var(--text-muted)" }}>
      {yMarcas.map((v) => (
        <g key={`y${v}`}>
          <line x1={margen.izquierda} x2={derecha} y1={escY(v)} y2={escY(v)} style={{ stroke: "var(--border)" }} />
          <text x={margen.izquierda - 6} y={escY(v) + 4} textAnchor="end">{formatoY(v)}</text>
        </g>
      ))}
      {xMarcas.map((v) => (
        <g key={`x${v}`}>
          <line x1={escX(v)} x2={escX(v)} y1={abajo} y2={abajo + 4} style={{ stroke: "var(--text-muted)" }} />
          <text x={escX(v)} y={abajo + 16} textAnchor="middle">{formatoX(v)}</text>
        </g>
      ))}
      <line x1={margen.izquierda} x2={derecha} y1={abajo} y2={abajo} style={{ stroke: "var(--text-muted)" }} />
      <line x1={margen.izquierda} x2={margen.izquierda} y1={margen.arriba} y2={abajo} style={{ stroke: "var(--text-muted)" }} />
      {x?.titulo ? <text x={(margen.izquierda + derecha) / 2} y={alto - 4} textAnchor="middle" style={{ fill: "var(--text)" }}>{x.titulo}</text> : null}
      {y?.titulo ? (
        <text transform={`translate(12 ${(margen.arriba + abajo) / 2}) rotate(-90)`} textAnchor="middle" style={{ fill: "var(--text)" }}>{y.titulo}</text>
      ) : null}
    </g>
  );
}

export function Leyenda({ series }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, margin: "4px 0 0 4px" }}>
      {series.map((s, i) => (
        <span key={s.nombre} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 3, background: s.color ?? PALETA[i % PALETA.length], borderTop: s.punteada ? "1px dashed white" : undefined, display: "inline-block" }} />
          {s.nombre}
        </span>
      ))}
    </div>
  );
}

// Líneas sobre ejes numéricos. `escalon`: escalera (supervivencia).
// `banda`: [{ x, y0, y1 }] sombreada (intervalos). `diagonal`: la línea del
// azar en ROC y calibración. `referencias`: líneas verticales marcadas.
export function GraficoLineas({ series, x = {}, y = {}, alto = 300, diagonal = false, referencias = [], leyenda = true, etiqueta = "gráfico" }) {
  const margen = { izquierda: 56, derecha: 16, arriba: 12, abajo: 42 };
  const todos = series.flatMap((s) => s.puntos);
  if (!todos.length) return <p className="crediscope-muted">Sin datos para graficar.</p>;
  const xMin = x.min ?? Math.min(...todos.map((p) => p.x)), xMax = x.max ?? Math.max(...todos.map((p) => p.x));
  const yMin = y.min ?? Math.min(0, ...todos.map((p) => p.y)), yMax = y.max ?? Math.max(...todos.map((p) => p.y), ...series.flatMap((s) => (s.banda ?? []).map((b) => b.y1)));
  const escX = (v) => margen.izquierda + ((v - xMin) / (xMax - xMin || 1)) * (ANCHO - margen.izquierda - margen.derecha);
  const escY = (v) => alto - margen.abajo - ((v - yMin) / (yMax - yMin || 1)) * (alto - margen.arriba - margen.abajo);
  const formatoX = x.formato ?? formatoPorDefecto, formatoY = y.formato ?? formatoPorDefecto;
  const camino = (puntos, escalon) => puntos.map((p, i) => {
    if (i === 0) return `M${escX(p.x)},${escY(p.y)}`;
    return escalon ? `H${escX(p.x)}V${escY(p.y)}` : `L${escX(p.x)},${escY(p.y)}`;
  }).join("");
  return (
    <div>
      <svg viewBox={`0 0 ${ANCHO} ${alto}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={etiqueta}>
        <Ejes x={x} y={y} alto={alto} margen={margen} xMarcas={marcas(xMin, xMax)} yMarcas={marcas(yMin, yMax)} escX={escX} escY={escY} formatoX={formatoX} formatoY={formatoY} />
        {diagonal ? <line x1={escX(xMin)} y1={escY(yMin)} x2={escX(xMax)} y2={escY(yMax)} style={{ stroke: "var(--text-muted)", strokeDasharray: "4 4" }} /> : null}
        {referencias.map((r) => (
          <g key={`${r.x}${r.texto}`}>
            <line x1={escX(r.x)} x2={escX(r.x)} y1={margen.arriba} y2={alto - margen.abajo} style={{ stroke: r.color ?? "var(--gold)", strokeDasharray: "3 3" }} />
            <text x={escX(r.x) + 4} y={margen.arriba + 10} style={{ fontSize: 11, fill: r.color ?? "var(--gold)" }}>{r.texto}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const color = s.color ?? PALETA[i % PALETA.length];
          const marcadores = s.puntos.length <= 60 ? s.puntos : s.puntos.filter((_, k) => k % Math.ceil(s.puntos.length / 60) === 0);
          return (
            <g key={s.nombre}>
              {s.banda?.length ? (
                <path
                  d={`${s.banda.map((b, k) => `${k ? (s.escalon ? "H" : "L") : "M"}${escX(b.x)},${escY(b.y1)}${s.escalon && k ? `V${escY(b.y1)}` : ""}`).join("")}${[...s.banda].reverse().map((b) => `L${escX(b.x)},${escY(b.y0)}`).join("")}Z`}
                  style={{ fill: color, opacity: 0.12, stroke: "none" }}
                />
              ) : null}
              <path d={camino(s.puntos, s.escalon)} style={{ fill: "none", stroke: color, strokeWidth: 2, strokeDasharray: s.punteada ? "6 4" : undefined }} />
              {marcadores.map((p, k) => (
                <circle key={k} cx={escX(p.x)} cy={escY(p.y)} r={s.puntos.length <= 60 ? 3 : 6} style={{ fill: s.puntos.length <= 60 ? color : "transparent" }}>
                  <title>{`${s.nombre}: ${p.titulo ?? `${formatoX(p.x)} → ${formatoY(p.y)}`}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      {leyenda && series.length > 1 ? <Leyenda series={series.map((s, i) => ({ ...s, color: s.color ?? PALETA[i % PALETA.length] }))} /> : null}
    </div>
  );
}

// Barras verticales por categoría (agrupadas o apiladas) y, si se pasa
// `linea`, una línea sobre un eje derecho (la tasa de malos de cada tramo).
export function GraficoBarras({ categorias, series, y = {}, alto = 300, apiladas = false, linea = null, ejeDerecho = {}, etiqueta = "gráfico de barras" }) {
  const margen = { izquierda: 56, derecha: linea ? 52 : 16, arriba: 12, abajo: categorias.length > 8 ? 70 : 42 };
  const totales = categorias.map((_, i) => (apiladas ? series.reduce((s, se) => s + (se.valores[i] ?? 0), 0) : Math.max(...series.map((se) => se.valores[i] ?? 0))));
  const yMax = y.max ?? Math.max(1e-9, ...totales);
  const formatoY = y.formato ?? formatoPorDefecto;
  const anchoUtil = ANCHO - margen.izquierda - margen.derecha;
  const banda = anchoUtil / Math.max(1, categorias.length);
  const escY = (v) => alto - margen.abajo - (v / yMax) * (alto - margen.arriba - margen.abajo);
  const lMax = linea ? ejeDerecho.max ?? Math.max(1e-9, ...linea.valores.filter(Number.isFinite)) : 1;
  const escL = (v) => alto - margen.abajo - (v / lMax) * (alto - margen.arriba - margen.abajo);
  const formatoL = ejeDerecho.formato ?? formatoPorDefecto;
  return (
    <div>
      <svg viewBox={`0 0 ${ANCHO} ${alto}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={etiqueta}>
        <g style={{ fontSize: 11, fill: "var(--text-muted)" }}>
          {marcas(0, yMax).map((v) => (
            <g key={v}>
              <line x1={margen.izquierda} x2={ANCHO - margen.derecha} y1={escY(v)} y2={escY(v)} style={{ stroke: "var(--border)" }} />
              <text x={margen.izquierda - 6} y={escY(v) + 4} textAnchor="end">{formatoY(v)}</text>
            </g>
          ))}
          {linea ? marcas(0, lMax).map((v) => (
            <text key={`d${v}`} x={ANCHO - margen.derecha + 6} y={escL(v) + 4} style={{ fill: linea.color ?? "var(--bad)" }}>{formatoL(v)}</text>
          )) : null}
          {y.titulo ? <text transform={`translate(12 ${(margen.arriba + alto - margen.abajo) / 2}) rotate(-90)`} textAnchor="middle" style={{ fill: "var(--text)" }}>{y.titulo}</text> : null}
          {linea && ejeDerecho.titulo ? (
            <text transform={`translate(${ANCHO - 6} ${(margen.arriba + alto - margen.abajo) / 2}) rotate(90)`} textAnchor="middle" style={{ fill: linea.color ?? "var(--bad)" }}>{ejeDerecho.titulo}</text>
          ) : null}
        </g>
        {categorias.map((cat, i) => {
          const x0 = margen.izquierda + i * banda;
          let acumulado = 0;
          const anchoBarra = apiladas ? banda * 0.7 : (banda * 0.8) / series.length;
          return (
            <g key={`${cat}${i}`}>
              {series.map((s, k) => {
                const v = s.valores[i] ?? 0;
                const xb = apiladas ? x0 + banda * 0.15 : x0 + banda * 0.1 + k * anchoBarra;
                const ya = apiladas ? escY(acumulado + v) : escY(v);
                const yb = apiladas ? escY(acumulado) : escY(0);
                if (apiladas) acumulado += v;
                return (
                  <rect key={s.nombre} x={xb} y={ya} width={Math.max(1, anchoBarra - 1)} height={Math.max(0, yb - ya)} style={{ fill: s.color ?? PALETA[k % PALETA.length] }}>
                    <title>{`${cat} · ${s.nombre}: ${s.formato ? s.formato(v) : formatoY(v)}`}</title>
                  </rect>
                );
              })}
              <text
                x={x0 + banda / 2}
                y={alto - margen.abajo + 14}
                textAnchor={categorias.length > 8 ? "end" : "middle"}
                transform={categorias.length > 8 ? `rotate(-35 ${x0 + banda / 2} ${alto - margen.abajo + 14})` : undefined}
                style={{ fontSize: 10.5, fill: "var(--text-muted)" }}
              >
                {String(cat).length > 18 ? `${String(cat).slice(0, 17)}…` : cat}
              </text>
            </g>
          );
        })}
        <line x1={margen.izquierda} x2={ANCHO - margen.derecha} y1={escY(0)} y2={escY(0)} style={{ stroke: "var(--text-muted)" }} />
        {linea ? (
          <g>
            <path
              d={linea.valores.map((v, i) => (Number.isFinite(v) ? `${i && Number.isFinite(linea.valores[i - 1]) ? "L" : "M"}${margen.izquierda + (i + 0.5) * banda},${escL(v)}` : "")).join("")}
              style={{ fill: "none", stroke: linea.color ?? "var(--bad)", strokeWidth: 2 }}
            />
            {linea.valores.map((v, i) => (Number.isFinite(v) ? (
              <circle key={i} cx={margen.izquierda + (i + 0.5) * banda} cy={escL(v)} r={3.5} style={{ fill: linea.color ?? "var(--bad)" }}>
                <title>{`${categorias[i]} · ${linea.nombre}: ${formatoL(v)}`}</title>
              </circle>
            ) : null))}
          </g>
        ) : null}
      </svg>
      {series.length > 1 || linea ? <Leyenda series={[...series.map((s, k) => ({ nombre: s.nombre, color: s.color ?? PALETA[k % PALETA.length] })), ...(linea ? [{ nombre: linea.nombre, color: linea.color ?? "var(--bad)" }] : [])]} /> : null}
    </div>
  );
}

// Cajas: mediana, cuartiles y bigotes (Tukey) por grupo; los atípicos no
// se dibujan uno por uno, se cuentan.
export function GraficoCajas({ grupos, y = {}, alto = 280, etiqueta = "gráfico de cajas" }) {
  const margen = { izquierda: 56, derecha: 16, arriba: 12, abajo: 42 };
  const validos = grupos.filter((g) => g.d?.n);
  if (!validos.length) return <p className="crediscope-muted">Sin datos para graficar.</p>;
  const yMin = y.min ?? Math.min(...validos.map((g) => g.d.bigotes[0]));
  const yMax = y.max ?? Math.max(...validos.map((g) => g.d.bigotes[1]));
  const escY = (v) => alto - margen.abajo - ((v - yMin) / (yMax - yMin || 1)) * (alto - margen.arriba - margen.abajo);
  const banda = (ANCHO - margen.izquierda - margen.derecha) / validos.length;
  const formatoY = y.formato ?? formatoPorDefecto;
  return (
    <svg viewBox={`0 0 ${ANCHO} ${alto}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={etiqueta}>
      <Ejes y={y} alto={alto} margen={margen} xMarcas={[]} yMarcas={marcas(yMin, yMax)} escX={() => 0} escY={escY} formatoX={() => ""} formatoY={formatoY} />
      {validos.map((g, i) => {
        const cx = margen.izquierda + (i + 0.5) * banda, w = Math.min(60, banda * 0.5);
        const color = g.color ?? PALETA[i % PALETA.length];
        const d = g.d;
        return (
          <g key={g.nombre}>
            <title>{`${g.nombre}: mediana ${formatoY(d.mediana)}, cuartiles ${formatoY(d.p25)} a ${formatoY(d.p75)}, ${d.atipicos} atípicos de ${d.n}`}</title>
            <line x1={cx} x2={cx} y1={escY(d.bigotes[0])} y2={escY(d.bigotes[1])} style={{ stroke: color }} />
            <rect x={cx - w / 2} y={escY(d.p75)} width={w} height={Math.max(1, escY(d.p25) - escY(d.p75))} style={{ fill: color, fillOpacity: 0.18, stroke: color }} />
            <line x1={cx - w / 2} x2={cx + w / 2} y1={escY(d.mediana)} y2={escY(d.mediana)} style={{ stroke: color, strokeWidth: 2.5 }} />
            <text x={cx} y={alto - margen.abajo + 16} textAnchor="middle" style={{ fontSize: 11, fill: "var(--text-muted)" }}>{g.nombre}</text>
            {d.atipicos ? <text x={cx} y={alto - margen.abajo + 30} textAnchor="middle" style={{ fontSize: 10, fill: "var(--text-muted)" }}>{`${d.atipicos} atípicos`}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

// Color divergente: azul para negativo, rojo para positivo, blanco en cero.
function colorDivergente(v, min, max) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "#f1f1f4";
  const t = v >= 0 ? Math.min(1, v / (max || 1)) : Math.min(1, v / (min || -1));
  const [r, g, b] = v >= 0 ? [185, 28, 28] : [67, 56, 202];
  const mezcla = (c) => Math.round(255 - (255 - c) * t);
  return `rgb(${mezcla(r)}, ${mezcla(g)}, ${mezcla(b)})`;
}

// Mapa de calor (correlaciones, faltantes). `valor(i, j)`.
export function MapaDeCalor({ filas, columnas, valor, min = -1, max = 1, formato = (v) => String(Number(v.toFixed(2))).replace(".", ","), alAbrir = null, etiqueta = "mapa de calor" }) {
  const margenIzq = 150, margenArriba = 110, celda = Math.max(10, Math.min(28, (ANCHO - margenIzq) / Math.max(1, columnas.length)));
  const ancho = margenIzq + celda * columnas.length + 4, alto = margenArriba + celda * filas.length + 4;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${ancho} ${alto}`} style={{ width: Math.max(ancho, 320), maxWidth: "100%", height: "auto", display: "block" }} role="img" aria-label={etiqueta}>
        {columnas.map((c, j) => (
          <text key={c} transform={`translate(${margenIzq + j * celda + celda / 2} ${margenArriba - 6}) rotate(-60)`} style={{ fontSize: 10, fill: "var(--text-muted)" }}>
            {c.length > 22 ? `${c.slice(0, 21)}…` : c}
          </text>
        ))}
        {filas.map((f, i) => (
          <g key={f}>
            <text x={margenIzq - 6} y={margenArriba + i * celda + celda / 2 + 3} textAnchor="end" style={{ fontSize: 10, fill: "var(--text-muted)" }}>
              {f.length > 24 ? `${f.slice(0, 23)}…` : f}
            </text>
            {columnas.map((c, j) => {
              const v = valor(i, j);
              return (
                <rect
                  key={c}
                  x={margenIzq + j * celda}
                  y={margenArriba + i * celda}
                  width={celda - 1}
                  height={celda - 1}
                  style={{ fill: colorDivergente(v, min, max), cursor: alAbrir ? "pointer" : undefined }}
                  onClick={alAbrir ? () => alAbrir(i, j) : undefined}
                >
                  <title>{`${f} × ${c}: ${v === null || v === undefined || !Number.isFinite(v) ? "sin dato" : formato(v)}`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

// Dispersión (PCA, dos variables). Cada punto con su color y su título.
export function GraficoDispersion({ puntos, x = {}, y = {}, alto = 340, etiqueta = "dispersión" }) {
  const margen = { izquierda: 56, derecha: 16, arriba: 12, abajo: 42 };
  if (!puntos.length) return <p className="crediscope-muted">Sin datos para graficar.</p>;
  const xMin = x.min ?? Math.min(...puntos.map((p) => p.x)), xMax = x.max ?? Math.max(...puntos.map((p) => p.x));
  const yMin = y.min ?? Math.min(...puntos.map((p) => p.y)), yMax = y.max ?? Math.max(...puntos.map((p) => p.y));
  const escX = (v) => margen.izquierda + ((v - xMin) / (xMax - xMin || 1)) * (ANCHO - margen.izquierda - margen.derecha);
  const escY = (v) => alto - margen.abajo - ((v - yMin) / (yMax - yMin || 1)) * (alto - margen.arriba - margen.abajo);
  return (
    <svg viewBox={`0 0 ${ANCHO} ${alto}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={etiqueta}>
      <Ejes x={x} y={y} alto={alto} margen={margen} xMarcas={marcas(xMin, xMax)} yMarcas={marcas(yMin, yMax)} escX={escX} escY={escY} formatoX={x.formato ?? formatoPorDefecto} formatoY={y.formato ?? formatoPorDefecto} />
      {puntos.map((p, i) => (
        <circle key={i} cx={escX(p.x)} cy={escY(p.y)} r={p.radio ?? 2.5} style={{ fill: p.color ?? "var(--brand)", fillOpacity: 0.55 }}>
          {p.titulo ? <title>{p.titulo}</title> : null}
        </circle>
      ))}
    </svg>
  );
}
