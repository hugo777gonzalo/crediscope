// Prueba lo que decide cómo se escribe y dónde se ubica una pantalla, sin
// navegador, sin base y sin datos de personas: formatos.js, mensajesDeError.js,
// navegacion.js, destinoDeIngreso.js y equifaxPantalla.js (todos de src/lib, sin
// React).
//
// Cada caso sale de un defecto real de la revisión de UX del 2026-10-10
// (docs/revision-ux.md): "2812" donde otra pantalla decía "2.812", "37.0 s",
// "0% (12)", la barra superior que decía "Detalle del lote" en /lotes/nuevo,
// el texto técnico de la base que llegaba al analista.
//
// Lo que no pasa por lint ni build se rompe en silencio: correrlo después de
// tocar cualquiera de esos cuatro archivos.
//
// Uso: node scripts/probar-formatos.mjs

import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(import.meta.dirname, "..");
const cargar = (rel) => import(pathToFileURL(path.join(RAIZ, rel)).href);

const F = await cargar("src/lib/formatos.js");
const { describirError } = await cargar("src/lib/mensajesDeError.js");
const { ubicacion, seccionesVisibles, hijosVisibles } = await cargar("src/lib/navegacion.js");
const D = await cargar("src/lib/destinoDeIngreso.js");

let fallas = 0;
function igual(nombre, obtenido, esperado) {
  const ok = Object.is(obtenido, esperado) || JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (!ok) fallas++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre}${ok ? "" : `: salió ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`}`);
}

// ---- Números: punto para los miles, coma para los decimales, también con 4 cifras
igual("entero: 4 cifras con separador", F.entero(2812), "2.812");
igual("entero: millones", F.entero(1234567), "1.234.567");
igual("entero: lo que no es número es «—», no 0", F.entero(null), "—");
igual("entero: texto vacío es «—»", F.entero(""), "—");
igual("decimal: coma", F.decimal(37.04), "37,0");
igual("decimal: 3 decimales", F.decimal(0.695, 3), "0,695");
igual("moneda: sin decimales", F.moneda(1784), "$1.784");
igual("moneda: 2 decimales", F.moneda(12.1444, 2), "$12,14");
igual("porcentaje: de una fracción", F.porcentaje(0.374), "37%");
igual("porcentaje: con decimales", F.porcentaje(0.374, 1), "37,4%");
igual("porcentajeDe: un grupo no vacío nunca es «0%»", F.porcentajeDe(12, 2812), "<1%");
igual("porcentajeDe: un grupo vacío sí es «0%»", F.porcentajeDe(0, 2812), "0%");
igual("porcentajeDe: sin total es «—»", F.porcentajeDe(5, 0), "—");

// ---- Duraciones y costos
igual("segundos: coma decimal", F.segundos(37040), "37,0 s");
igual("segundos: menos de un segundo, en milisegundos", F.segundos(900), "900 ms");
igual("duracionLarga: 9.049 minutos", F.duracionLarga(9049), "6 d 6 h");
igual("duracionLarga: horas y minutos", F.duracionLarga(130), "2 h 10 min");
igual("centavos: coma decimal", F.centavos(0.043), "4,3¢");

// ---- Plurales (el «(s)» es no decidir)
igual("plural: singular", F.plural(1, "llamada"), "1 llamada");
igual("plural: plural con miles", F.plural(2743, "llamada"), "2.743 llamadas");
igual("plural: palabra invariable", F.plural(3, "análisis hecho", "análisis hechos"), "3 análisis hechos");

// ---- Textos que la clasificación guardó con formato de JavaScript
igual(
  "humanizarTexto: mes ISO y «corte»",
  F.humanizarTexto("100% del ingreso reportado en el corte 2026-08 viene de empleo."),
  "100% del ingreso reportado en la información IESS de Ago 2026 viene de empleo.",
);
igual("humanizarTexto: «del corte»", F.humanizarTexto("fuera del corte 2026-07"), "fuera de la información IESS de Jul 2026");
igual("humanizarTexto: mes suelto", F.humanizarTexto("el último registro es de 2018-05."), "el último registro es de May 2018.");
igual("humanizarTexto: dólares sin separador", F.humanizarTexto("una nómina de $1084 mensuales"), "una nómina de $1.084 mensuales");
igual("humanizarTexto: dólares con punto decimal", F.humanizarTexto("base de $491.22"), "base de $491,22");
igual("humanizarTexto: miles ya bien escritos no se tocan", F.humanizarTexto("$2.641 del sector público"), "$2.641 del sector público");
igual("humanizarTexto: «(s)» con su número", F.humanizarTexto("Tiene 1 establecimiento(s) registrado(s)"), "Tiene 1 establecimiento registrado");
igual("humanizarTexto: «(s)» en plural", F.humanizarTexto("Tiene 3 establecimiento(s) activo(s)"), "Tiene 3 establecimientos activos");
igual("humanizarTexto: minutos largos", F.humanizarTexto("Estuvo sin funcionar 9049 minutos."), "Estuvo sin funcionar 6 d 6 h.");
igual("humanizarTexto: la sigla del proveedor", F.humanizarTexto("error del LLM"), "error del modelo");
igual("humanizarTexto: es idempotente", F.humanizarTexto(F.humanizarTexto("en el corte 2026-08 y $1084")), F.humanizarTexto("en el corte 2026-08 y $1084"));

// ---- Errores: lo técnico no llega al analista, y no se pierde
{
  const colFaltante = describirError({ message: 'column bandeja_solicitudes.es_sintetico does not exist', code: "42703" });
  igual("error: columna que la base no tiene → desfase, con el detalle técnico", colFaltante.mensaje.includes("desfase") && colFaltante.detalle.includes("es_sintetico"), true);
  const uuid = describirError('invalid input syntax for type uuid: "null"');
  igual("error: uuid nulo → falta elegir qué abrir", uuid.mensaje.startsWith("A este enlace le falta"), true);
  const tiempo = describirError("canceling statement due to statement timeout");
  igual("error: tiempo agotado se puede reintentar", tiempo.reintentable, true);
  const red = describirError(new TypeError("Failed to fetch"));
  igual("error: sin conexión se puede reintentar", red.reintentable, true);
  const jwt = describirError("JWT expired");
  igual("error: sesión caducada no se reintenta", jwt.reintentable, false);
  const propio = describirError("La fuente no contestó: volvé a consultar en unos minutos.");
  igual("error: un mensaje propio en castellano se muestra tal cual", propio.mensaje, "La fuente no contestó: volvé a consultar en unos minutos.");
  igual("error: un mensaje propio no trae «detalle técnico»", propio.detalle, null);
  const objeto = describirError({ message: "algo", details: "más", code: "P0001" });
  igual("error: un objeto de PostgREST se lee completo", objeto.detalle === null || String(objeto.detalle).includes("P0001") || objeto.mensaje.includes("algo"), true);
  igual("error: vacío no rompe", describirError(null).mensaje, "No se pudo completar la operación.");
}

// ---- Ubicación: lo que dice la barra superior y qué resalta el menú
const ubic = (ruta) => {
  const u = ubicacion(ruta);
  return u.pagina ? `${u.seccion} › ${u.pagina}` : u.seccion;
};
igual("ubicación: inicio", ubic("/"), "Inicio");
igual("ubicación: bandeja", ubic("/solicitudes"), "Solicitudes › Bandeja");
igual("ubicación: expediente", ubic("/solicitudes/0000000000"), "Solicitudes › Expediente");
igual("ubicación: lo que guardó una consulta cuelga del expediente", ubic("/historial/perfil/abc"), "Solicitudes › Perfil del Cliente guardado");
igual("ubicación: el historial por cédula se retiró (cae en la sección, sin página)", ubic("/historial"), "Solicitudes");
igual("ubicación: «Reportes» pasó a «Monitoreo»", ubic("/reportes"), "Monitoreo › Panorama");
igual("ubicación: Descargas es de Monitoreo", ubic("/reportes/descargas"), "Monitoreo › Descargas");
igual("ubicación: «Lotes corridos» pasó a «Lotes consultados»", ubic("/lotes"), "Consultas por lote › Lotes consultados");
igual("ubicación: el explorador de la fuente de datos", ubic("/explorar"), "Configuración › Explorador de la fuente de datos");
igual("ubicación: personas por segmento", ubic("/fuentes/clientes"), "Fuentes de Ingreso › Personas por segmento");
igual("ubicación: /lotes/nuevo NO es el detalle de un lote", ubic("/lotes/nuevo"), "Consultas por lote › Cargar archivo");
igual("ubicación: detalle de un lote", ubic("/lotes/abc"), "Consultas por lote › Detalle del lote");
igual("ubicación: el Laboratorio ya no dice «CrediScope»", ubic("/laboratorio/desempeno"), "Laboratorio › Prueba retrospectiva");
igual("ubicación: pantalla del Laboratorio fuera del menú", ubic("/laboratorio/cortes/nuevo"), "Laboratorio › Nuevo corte");
igual("ubicación: Aval de Configuración", ubic("/admin/fuentes/aval"), "Configuración › Fuentes que consultamos › Aval");
igual("ubicación: Equifax de Configuración", ubic("/admin/fuentes/equifax"), "Configuración › Fuentes que consultamos › Equifax");
igual("ubicación: la pestaña Equifax cuenta como «Buró»", ubic("/equifax/0000000000"), "Evaluación Crediticia › Buró");
igual("ubicación: la pestaña Aval también", ubic("/aval/0000000000"), "Evaluación Crediticia › Buró");
igual("ubicación: «Evaluación Crediticia» no se prende en el inicio", ubic("/"), "Inicio");
igual("ubicación: una dirección que no existe", ubic("/no-existe"), "CrediScope");
{
  const comun = seccionesVisibles(false).map((s) => s.texto);
  const admin = seccionesVisibles(true).map((s) => s.texto);
  igual("menú: quien no es admin no ve Costos, Laboratorio ni Configuración", ["Costos", "Laboratorio", "Configuración", "Consultas por lote"].some((t) => comun.includes(t)), false);
  igual("menú: admin ve las nueve secciones", admin.length, 9);
  const fuentes = seccionesVisibles(false).find((s) => s.id === "fuentes");
  igual("menú: «Parámetros» es sólo de admin", hijosVisibles(fuentes, false).some((h) => h.texto === "Parámetros"), false);
}

// ---- A dónde se vuelve tras ingresar: sólo rutas internas
igual("destino: una ruta interna se respeta", D.destinoDeIngreso({ desde: "/solicitudes?estado=sin_analisis" }), "/solicitudes?estado=sin_analisis");
igual("destino: sin estado, al inicio", D.destinoDeIngreso(null), "/");
igual("destino: una dirección de otro sitio no se acepta", D.destinoDeIngreso({ desde: "//ejemplo.com/x" }), "/");
igual("destino: una URL completa no se acepta", D.destinoDeIngreso({ desde: "https://ejemplo.com" }), "/");
igual("destino: no se vuelve al ingreso (sería un ciclo)", D.destinoDeIngreso({ desde: "/login" }), "/");
igual("destino: después de salir a propósito no se recuerda", (D.marcarSalidaAProposito(), D.sePuedeRecordarElDestino()), false);
igual("destino: al ingresar se vuelve a recordar", (D.olvidarSalidaAProposito(), D.sePuedeRecordarElDestino()), true);

// ---- Equifax: la franja de 24 meses y la deuda por sistema (equifaxPantalla.js)
{
  const E = await cargar("src/lib/equifaxPantalla.js");
  const fila = (fecha_corte, rol, dias_morosidad) => ({ fecha_corte, rol, dias_morosidad, vencido_usd: 0 });
  const historia = [
    fila("2026-08-31", "titular", 0),
    fila("2026-08-31", "titular", 45),
    fila("2026-07-31", "titular", 0),
    // Un mes sólo como codeudor: no es un mes al día del titular.
    fila("2026-06-30", "codeudor", 120),
    fila("2024-09-30", "titular", 95),
  ];
  const franja = E.franjaDePagos(historia);
  igual("equifax: la franja tiene 24 meses", franja.length, 24);
  igual("equifax: termina en el último corte", franja[23].mes, "2026-08");
  igual("equifax: empieza 23 meses antes", franja[0].mes, "2024-09");
  igual("equifax: el color es el peor atraso del mes", franja[23].nivel, "hasta_90");
  igual("equifax: cuenta las operaciones con atraso del mes", [franja[23].operaciones, franja[23].enMora], [2, 1]);
  igual("equifax: un mes al día", franja[22].nivel, "al_dia");
  igual("equifax: lo del codeudor no pinta el mes del titular", franja[21].nivel, "sin_deuda");
  igual("equifax: más de 90 días", franja[0].nivel, "mas_de_90");
  igual("equifax: el mes se escribe como en el resto de la app", franja[23].texto, "Ago 2026");
  igual("equifax: sin historia, sin franja", E.franjaDePagos([]), []);
  igual(
    "equifax: el atraso suma vencido, no devenga, demanda y castigo",
    E.enAtraso({ saldoVencidoUsd: 10.1, saldoNoDevengaInteresesUsd: 0.2, saldoDemandaJudicialUsd: 5, saldoCarteraCastigadaUsd: 0 }),
    15.3,
  );
  const filas = E.filasDeDeuda({ deudaActualTitular: { bancos: { numeroDeOperaciones: 2, saldoDeudaUsd: 100, conciliaConElResumen: "si" } } });
  igual("equifax: siempre los tres sistemas, aunque uno no tenga deuda", filas.map((f) => [f.texto, f.operaciones]), [
    ["Bancos", 2],
    ["Cooperativas", 0],
    ["Sector comercial", 0],
  ]);
  igual(
    "equifax: lo propio primero y la deuda más grande arriba",
    E.operacionesOrdenadas([
      { orden: 1, rol: "codeudor", saldo_deuda_usd: 900 },
      { orden: 2, rol: "titular", saldo_deuda_usd: 10 },
      { orden: 3, rol: "titular", saldo_deuda_usd: 50 },
    ]).map((o) => o.orden),
    [3, 2, 1],
  );
  igual("equifax: «Tarjeta» se lee como tarjeta de crédito", E.tipoDeCredito("Tarjeta"), "Tarjeta de crédito");
  igual("equifax: «MORA 30 AL DIA» no se lee como contradicción", E.estadoDeCarteraLegible("MORA 30 AL DIA"), "Al día, con atrasos de hasta 30 días");
  igual("equifax: «ESTA EN MORA 60»", E.estadoDeCarteraLegible("ESTA EN MORA 60"), "En mora de hasta 60 días");
  igual("equifax: «CART. CASTIGADA»", E.estadoDeCarteraLegible("CART. CASTIGADA"), "Cartera castigada");
  igual("equifax: un estado desconocido, como oración", E.estadoDeCarteraLegible("ALGO NUEVO"), "Algo nuevo");
}

console.log(fallas ? `\n${fallas} FALLAS` : "\nTodo cuadra.");
process.exit(fallas ? 1 : 0);
