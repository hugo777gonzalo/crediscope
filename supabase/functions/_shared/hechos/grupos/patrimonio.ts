// Grupo «patrimonio» de la capa de hechos (docs/capa-de-hechos.md, 4.5): los 12 campos de
// `patrimonio`, de tres fuentes que no se mezclan entre sí: `vehiculos` (lista
// `personaVehiculo`, 10 campos), `bienesInmueble` y `inversiones` (sólo se cuentan: no se
// conoce la forma de un registro que diga cuánto vale).
//
// ETAPA A. process.ts sigue armando `patrimonio` como siempre y estas reglas son una copia de
// las suyas (líneas de «---- patrimonio ----»): la paridad sobre las 3.766 personas reales y
// sobre los crudos inventados es lo que prueba que la copia no se apartó. En la etapa B
// process.ts pasa a `perfilDesdeHechos(hechos, "patrimonio")` y la copia desaparece.
//
// POR QUÉ ESTE GRUPO (P61 del marco, 11.1). marco-v36 le pide al modelo, en prosa, que para el
// valor de los vehículos use `valorColateralVehiculos` y no `valorAvaluoVehiculos`, porque el
// avalúo del SRI usa depreciación fiscal lineal y castiga a los vehículos viejos ($82 en una
// moto 2016). Con el grupo en hechos, cada vehículo dice qué precio sostiene su colateral y
// qué avalúo se dejó de lado, y la v37 puede mandarle al modelo sólo el colateral (la
// propuesta y lo medido, en 4.5 del diseño).
//
// LAS REGLAS QUE ELIGEN:
//   - `pat.colateral@2` (estructura-v21, p10, negocio 2026-11-09): por vehículo, el primer
//     precio de mercado que la fuente trae (promedio, comercial, de venta promedio, de venta
//     al público) y el avalúo sólo sin ninguno; un avalúo negativo vale 0. Con un precio de
//     mercado, el avalúo del mismo vehículo queda descartado con su motivo. La @1, hasta
//     estructura-v20, era el máximo de siete precios: pasaba en más de 25% al precio promedio
//     en 550 de 2.198 personas. `precioVenta` no entra en ninguna: en los vehículos viejos es
//     el precio de lista de cuando eran nuevos.
//   - `pat.vehiculos.por_tipo@1`: autos, pesados y motos por `tipoComercial`, tal como lo
//     escribe la fuente; un vehículo de otro tipo (o sin tipo) cuenta en `numeroVehiculos` y en
//     ninguno de los tres.
//
// UNA FUENTE QUE NO CONTESTÓ NO ES UNA FUENTE QUE DICE «NO HAY». `vehiculos` dice «no hay» con
// `faltante` (calidad-de-la-consulta.ts, FUENTES): sólo un `error` o `deshabilitado` la deja
// sin dato. `bienesInmueble` e `inversiones` dicen «no hay» con la lista vacía, y un `faltante`
// es una caída. En la etapa A el perfil escribe el `parcial` (lo que trajeron las filas que
// llegaron, casi siempre 0), como hoy.

import { ayudanteDelGrupo, type Emisor } from "../emisor.ts";
import { type AnyRecord, aportesDe, citar, type Fila, filasDe, num, redondear, refDeFila, refDeRespuesta, respuestaDe } from "../lectura-del-crudo.ts";
import type { CodigoDelCatalogo, Contexto, Descarte, MotivoDeNoDisponible, RefDeRegistro } from "../tipos.ts";
import { FUENTES } from "../../calidad-de-la-consulta.ts";

const PAT = "patrimonio.";

function codigo(cod: string, unidad: CodigoDelCatalogo["unidad"], descripcion: string, campo: string, enSinValor: CodigoDelCatalogo["enElPerfilSinValor"], recuento?: CodigoDelCatalogo["recuento"]): CodigoDelCatalogo {
  const c: CodigoDelCatalogo = { codigo: cod, unidad, descripcion, llegaAlModelo: true, esIdentificador: false, campoDelPerfil: PAT + campo, enElPerfilSinValor: enSinValor };
  if (recuento) c.recuento = recuento;
  return c;
}

// En el orden de `patrimonio` en types.ts: el modelo lee el JSON en orden.
export const CATALOGO: CodigoDelCatalogo[] = [
  codigo("pat.vehiculos.cantidad", "cantidad", "Vehículos a su nombre", "numeroVehiculos", 0, "conteo"),
  codigo("pat.vehiculos.avaluo.total", "usd", "Suma del avalúo del SRI de sus vehículos (depreciación fiscal lineal: castiga a los viejos; para el valor, el colateral)", "valorAvaluoVehiculos", 0, "suma"),
  codigo("pat.inmuebles.cantidad", "cantidad", "Inmuebles a su nombre", "numeroInmuebles", 0, "conteo"),
  codigo("pat.inversiones.cantidad", "cantidad", "Inversiones registradas", "numeroInversiones", 0, "conteo"),
  codigo("pat.vehiculos.existe", "si_no", "Tiene al menos un vehículo a su nombre", "tieneVehiculos", false),
  codigo("pat.vehiculos.autos.cantidad", "cantidad", "Vehículos de tipo comercial «autos»", "numeroAutos", 0, "conteo"),
  codigo("pat.vehiculos.pesados.cantidad", "cantidad", "Vehículos de tipo comercial «pesados»", "numeroVehiculosPesados", 0, "conteo"),
  codigo("pat.vehiculos.motos.cantidad", "cantidad", "Vehículos de tipo comercial «motos»", "numeroMotos", 0, "conteo"),
  codigo("pat.vehiculos.precio_comercial.total", "usd", "Suma del precio comercial de los vehículos que lo traen", "valorComercialTotalVehiculos", 0, "suma"),
  codigo("pat.vehiculos.precio_venta_publico.total", "usd", "Suma del precio de venta al público de los vehículos que lo traen", "valorVentaTotalVehiculos", 0, "suma"),
  codigo("pat.vehiculos.precio_venta_promedio.total", "usd", "Suma del precio de venta promedio de los vehículos que lo traen", "valorPromedioTotalVehiculos", 0, "suma"),
  codigo("pat.vehiculos.colateral.total", "usd", "Lo que se espera obtener al vender sus vehículos: por vehículo, el precio de mercado, y el avalúo sólo sin ninguno", "valorColateralVehiculos", 0, "suma"),
];

export const REGLAS_QUE_MEZCLAN: string[] = [
  "pat.colateral@2", // elige, por vehículo, el precio de mercado y descarta el avalúo
  "pat.vehiculos.por_tipo@1", // cuenta cada tipo comercial y descarta los vehículos de otro
];

const FUENTE_VEHICULOS = "vehiculos";
const FUENTE_INMUEBLES = "bienesInmueble";
const FUENTE_INVERSIONES = "inversiones";

// El orden es la regla: el primero que la fuente trae mayor que 0.
export const PRECIOS_DE_MERCADO = ["precioPromedio", "precioComercial", "precioVentaPromedio", "precioVentaPublico"] as const;

// El precio que sostiene el colateral de un vehículo y de qué campo sale (null: no aporta).
export function precioDeColateral(v: AnyRecord): { campo: string | null; valor: number } {
  for (const c of PRECIOS_DE_MERCADO) {
    const p = num(v[c]) ?? 0;
    if (p > 0) return { campo: c, valor: p };
  }
  const avaluo = Math.max(0, num(v.valorAvaluo) ?? 0);
  return { campo: avaluo > 0 ? "valorAvaluo" : null, valor: avaluo };
}

const TIPOS = [
  ["pat.vehiculos.autos.cantidad", "autos"],
  ["pat.vehiculos.pesados.cantidad", "pesados"],
  ["pat.vehiculos.motos.cantidad", "motos"],
] as const;

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  const consulta = contexto.consulta;
  const h = ayudanteDelGrupo(emisor, CATALOGO);

  const estado = new Map<string, "contesto" | MotivoDeNoDisponible>();
  const contesto = (fuente: string) => {
    if (!estado.has(fuente)) {
      const dicenNoHayConFaltante = FUENTES[fuente]?.noHay === "faltante" && (crudo[fuente] as AnyRecord | undefined)?.status === "faltante";
      estado.set(fuente, dicenNoHayConFaltante ? "contesto" : respuestaDe(crudo, fuente));
    }
    return estado.get(fuente)!;
  };
  // Con la fuente caída, sin valor y con el parcial: lo que dice la regla con las filas que llegaron.
  function emitirHecho(cod: string, regla: string, fuente: string, valor: number | boolean, registros: RefDeRegistro[], descartados: Descarte[] = []) {
    const caida = contesto(fuente);
    if (caida !== "contesto") return void h.sinValor(cod, regla, [fuente], caida, valor);
    h.confirmado(cod, regla, [fuente], valor, registros, null, { descartados });
  }

  // ---- Vehículos ----
  const vehiculos = filasDe(crudo, FUENTE_VEHICULOS, "personaVehiculo");
  const respuestaVeh = [refDeRespuesta(crudo, consulta, FUENTE_VEHICULOS, "personaVehiculo")];
  const filas = (fs: Fila[]) => fs.map((f) => refDeFila(consulta, f));
  const todas = filas(vehiculos);

  emitirHecho("pat.vehiculos.cantidad", "pat.vehiculos@1", FUENTE_VEHICULOS, vehiculos.length, citar(todas, [], respuestaVeh));
  emitirHecho("pat.vehiculos.existe", "pat.vehiculos@1", FUENTE_VEHICULOS, vehiculos.length > 0, citar(todas, [], respuestaVeh));

  for (const [cod, tipo] of TIPOS) {
    const delTipo = vehiculos.filter((f) => f.r.tipoComercial === tipo);
    const descartes = vehiculos.filter((f) => f.r.tipoComercial !== tipo).map((f) => ({ registro: refDeFila(consulta, f, "tipoComercial"), motivo: "es_de_otro_tipo_comercial" }));
    emitirHecho(cod, "pat.vehiculos.por_tipo@1", FUENTE_VEHICULOS, delTipo.length, citar(filas(delTipo), [], respuestaVeh), descartes);
  }

  // Las sumas de un campo, como `sumVeh` de process.ts: el campo de cada vehículo, sin redondear.
  const suma = (cod: string, campo: string) => {
    const valor = vehiculos.reduce((s, f) => s + (num(f.r[campo]) ?? 0), 0);
    emitirHecho(cod, "pat.vehiculos.suma@1", FUENTE_VEHICULOS, valor, citar(aportesDe(consulta, vehiculos, () => campo), todas, respuestaVeh));
  };
  suma("pat.vehiculos.avaluo.total", "valorAvaluo");
  suma("pat.vehiculos.precio_comercial.total", "precioComercial");
  suma("pat.vehiculos.precio_venta_publico.total", "precioVentaPublico");
  suma("pat.vehiculos.precio_venta_promedio.total", "precioVentaPromedio");

  // El colateral: cada vehículo cita el campo que lo sostiene; con un precio de mercado, el avalúo
  // del mismo vehículo se descarta (P61: es el valor que el marco le pide al modelo no usar).
  const aportan: RefDeRegistro[] = [];
  const descartesColateral: Descarte[] = [];
  let colateral = 0;
  for (const f of vehiculos) {
    const { campo, valor } = precioDeColateral(f.r);
    colateral += valor;
    if (campo) aportan.push(refDeFila(consulta, f, campo));
    if (campo && campo !== "valorAvaluo" && "valorAvaluo" in f.r) descartesColateral.push({ registro: refDeFila(consulta, f, "valorAvaluo"), motivo: "trae_precio_de_mercado_y_el_avaluo_no_se_usa" });
  }
  emitirHecho("pat.vehiculos.colateral.total", "pat.colateral@2", FUENTE_VEHICULOS, redondear(colateral), citar(aportan, todas, respuestaVeh), descartesColateral);

  // ---- Inmuebles e inversiones: sólo se cuentan ----
  const contar = (cod: string, fuente: string, lista: string) => {
    const fs = filasDe(crudo, fuente, lista);
    emitirHecho(cod, `${cod.split(".").slice(0, 2).join(".")}@1`, fuente, fs.length, citar(filas(fs), [], [refDeRespuesta(crudo, consulta, fuente, lista)]));
  };
  contar("pat.inmuebles.cantidad", FUENTE_INMUEBLES, "bienesInmueble");
  contar("pat.inversiones.cantidad", FUENTE_INVERSIONES, "inversiones");
}
