// Grupo 2 de la capa de hechos: el historial de la persona con la institución que
// pide el crédito (docs/capa-de-hechos.md, 4.2). Fuente: `basesInternas`, lista
// `personasIncumplimientos`, una fila por OPERACIÓN.
//
// ETAPA B (estructura-v29). process.ts arma `comportamientoInterno` con `perfilDesdeHechos()`
// y la regla de elección de abajo (`elegirOperacion`) es la única implementación: la copia
// `operacionDelComportamientoInterno` de process.ts se sacó. Con la base interna sin respuesta
// el campo es null y el grupo lo lista en `camposSinDato` (campos-sin-dato.ts); hasta la v28
// el perfil escribía «no es cliente» y el resto en null, como si la fuente hubiera dicho que no
// hay operaciones. Con la fuente contestando y sin operaciones, «no es cliente» sí es un valor.
//
// Decisión del negocio (D5, 2026-11-18): se sigue reportando UNA sola operación,
// la elegida. Las demás son historia de pago, no deuda. Por eso:
//   - los siete campos del perfil citan la elegida y llevan las otras en
//     `descartados`, con el motivo;
//   - los tres hechos nuevos (`inst.operaciones.cantidad`, `.vigentes` e
//     `inst.mora.dias_max_entre_todas`) existen para medir, pero no tienen campo del
//     perfil, no llegan al modelo, no van a pantalla y ninguna señal ni suma los
//     toma: sumar operaciones de la institución a la deuda del buró las contaría
//     dos veces si la institución también las reporta a bancos (sección 4.2).
// Medido sobre el respaldo del 03/10 (2.567 personas): 2.533 tienen operaciones,
// 746 más de una (371 con dos vigentes o más, 278 con dos canceladas o más).

import { ayudanteDelGrupo, type Emisor } from "../emisor.ts";
import { type AnyRecord, deudaDe, esGarantia, fechaIsoDe, type Fila, filasDe, num, redondear, refDeFila, refDeRespuesta, respuestaDe, textoDe } from "../lectura-del-crudo.ts";
import type { CodigoDelCatalogo, Contexto, Descarte, DiferenciaEsperada, Entidad, OperacionDeCredito, RefDeRegistro } from "../tipos.ts";

const P = "comportamientoInterno.";

// Lo nuevo (sin campo del perfil) no llega al modelo sin una decisión del negocio.
function codigo(
  codigo: string,
  unidad: CodigoDelCatalogo["unidad"],
  descripcion: string,
  campo: string | null,
  enElPerfilSinValor: CodigoDelCatalogo["enElPerfilSinValor"],
  recuento?: CodigoDelCatalogo["recuento"],
): CodigoDelCatalogo {
  const c: CodigoDelCatalogo = { codigo, unidad, descripcion, llegaAlModelo: campo !== null, esIdentificador: false };
  if (campo !== null) {
    c.campoDelPerfil = P + campo;
    c.enElPerfilSinValor = enElPerfilSinValor;
  }
  if (recuento) c.recuento = recuento;
  return c;
}

export const CATALOGO: CodigoDelCatalogo[] = [
  codigo("inst.operacion.estado", "texto", "Estado de la operación reportada con la institución (vigente o cancelada)", "proveedorInfo1EstadoOperacion", null),
  codigo("inst.operacion.saldo", "usd", "Saldo de capital de la operación reportada con la institución", "proveedorInfo1SaldoCapitalVigente", null, "suma"),
  codigo("inst.mora.dias_vigente", "dias", "Días de mora vigentes de la operación reportada", "proveedorInfo1DiasMoraVigente", null, "maximo"),
  codigo("inst.mora.dias_max", "dias", "Días de mora máximos de la operación reportada", "proveedorInfo1DiasMoraMaxima", null, "maximo"),
  codigo("inst.habito_de_pago", "texto", "Resultado del hábito de pago de la operación reportada", "proveedorInfo1ResultadoHabitoPago", null),
  codigo("inst.perfil_interno", "texto", "Perfil interno de la operación reportada", "proveedorInfo1PerfilInterno", null),
  codigo("inst.es_cliente", "si_no", "La persona figura como cliente de la institución", "esClienteInterno", false),
  // Nuevos (D5): no llegan a ninguna parte, ni al perfil.
  codigo("inst.operaciones.cantidad", "cantidad", "Operaciones de la persona con la institución, todas", null, null, "conteo"),
  codigo("inst.operaciones.vigentes", "cantidad", "Operaciones de la persona con la institución que no están canceladas", null, null, "conteo"),
  codigo("inst.mora.dias_max_entre_todas", "dias", "Días de mora máximos entre todas las operaciones con la institución", null, null, "maximo"),
  // E9, punto 3: informativa, no cambia ningún valor (ver diferenciasConBancos).
  codigo("dif.inst.posible_en_bancos", "usd", "Saldo de una operación con la institución contra la deuda de una fila de bancos que puede ser la misma", null, null),
];

// Las que eligen o descartan registros: cada una con un crudo inventado en que
// aplica y uno en que no (scripts/crudos-sinteticos/, campo `reglas`).
export const REGLAS_QUE_MEZCLAN: string[] = [
  "inst.operacion@1", // elige UNA operación y descarta las demás
];

export const DIFERENCIAS_ESPERADAS: DiferenciaEsperada[] = [
  {
    campo: "comportamientoInterno.*",
    detector: "dato-de-la-institucion-de-fuente-sin-respuesta-escrito-como-total",
    aprobadaEl: "pendiente: la aprueba el negocio con el PR de estructura-v29",
    motivo: "con la base interna sin respuesta el campo queda sin dato: hasta la v28 esClienteInterno decía false, como si la institución no tuviera operaciones de la persona",
    cuando: "sin_dato",
  },
];

const FUENTES = ["basesInternas"];
const LISTA = "personasIncumplimientos";

const esCancelada = (r: AnyRecord) => String(r.estadoOperacion ?? "").trim().toUpperCase() === "CANCELADA";
// El tamaño de la operación para elegir: el saldo en una vigente; en una
// cancelada, cuota por plazo (la fuente no trae el valor financiado).
const tamano = (r: AnyRecord) => (esCancelada(r) ? (num(r.cuotaNova) ?? 0) * (num(r.plazoCuotas) ?? 0) : num(r.saldoCapital) ?? 0);
const numeroDe = (r: AnyRecord) => num(r.operacion) ?? 0;

// La regla de la p3 de la revisión del análisis (estructura-v21; hasta la v28, la función
// operacionDelComportamientoInterno de process.ts): una vigente antes que una cancelada;
// entre vigentes, la de mayor saldo; entre canceladas, la de mayor cuota por plazo; empate,
// el número de operación más alto. El orden es estable: con todo igual queda la primera de
// la lista, como siempre.
export function elegirOperacion(filas: Fila[]): Fila | null {
  return (
    [...filas].sort(
      (a, b) => Number(esCancelada(a.r)) - Number(esCancelada(b.r)) || tamano(b.r) - tamano(a.r) || numeroDe(b.r) - numeroDe(a.r),
    )[0] ?? null
  );
}

// Por qué una operación no es la elegida, y qué campo lo decidió.
function motivoDeDescarte(elegida: Fila, otra: Fila): { motivo: string; campo: string } {
  if (esCancelada(otra.r) && !esCancelada(elegida.r)) return { motivo: "cancelada_con_una_vigente", campo: "estadoOperacion" };
  const mismoTamano = tamano(otra.r) === tamano(elegida.r);
  if (!mismoTamano) {
    return esCancelada(elegida.r)
      ? { motivo: "cancelada_de_menor_tamano", campo: "cuotaNova" }
      : { motivo: "vigente_de_menor_saldo", campo: "saldoCapital" };
  }
  if (numeroDe(otra.r) !== numeroDe(elegida.r)) return { motivo: "empate_gana_el_numero_de_operacion_mas_alto", campo: "operacion" };
  return { motivo: "empate_total_gana_la_primera", campo: "operacion" };
}

// El corte de la fila: `fechaCorte` viene como «2026-09-30». CAMPO_DE_CORTE de
// lectura-del-crudo se indexa por fuente y `basesInternas` trae listas sin corte,
// así que la fecha se lee acá.
function corteDeLaFila(f: Fila): string | null {
  const t = String(f.r.fechaCorte ?? "").trim();
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }
  return fechaIsoDe(t);
}
// Lo que se afirma no es más reciente que el corte más antiguo de lo citado.
function corteMasAntiguoDe(filas: Fila[]): string | null {
  let minimo: string | null = null;
  for (const f of filas) {
    const c = corteDeLaFila(f);
    if (c && (minimo === null || c < minimo)) minimo = c;
  }
  return minimo;
}

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  const consulta = contexto.consulta;
  const h = ayudanteDelGrupo(emisor, CATALOGO);
  const operaciones = filasDe(crudo, "basesInternas", LISTA);

  // Cada operación es una entidad (1.3): el número de operación, o su posición.
  const claves = new Map<Fila, Entidad["clave"]>();
  for (const f of operaciones) {
    const numero = String(f.r.operacion ?? "").trim().replace(/^0+/, "");
    const clave = emisor.clave("op", numero ? `inst#${numero}` : `${f.fuente}.${f.lista}#${f.indice}`);
    claves.set(f, clave);
    const registro = refDeFila(consulta, f);
    // El saldo de capital de esta fuente no se interpreta como saldo por vencer ni
    // vencido (no se sabe cuál es): vive en el hecho que cita la fila, sin sumarse.
    const atributos: OperacionDeCredito = {
      sistema: "institucion",
      acreedor: null,
      rol: "titular",
      estado: esCancelada(f.r) ? "cancelada" : String(f.r.estadoOperacion ?? "").trim().toUpperCase() === "VIGENTE" ? "vigente" : null,
      fechaDeConcesion: null,
      montoOriginal: null,
      saldoPorVencer: null,
      saldoVencido: null,
      saldoNoDevenga: null,
      saldoEnDemanda: null,
      saldoCastigado: null,
      diasDeMora: num(f.r.diasMoraVigentes),
      calificacion: null,
      cuotaMensual: num(f.r.cuotaNova),
      saldoTotal: null,
    };
    emisor.entidad({
      clave,
      tipo: "operacion",
      atributos,
      vistas: [{ registro, fechaDelDato: corteDeLaFila(f), atributos }],
      union: null,
      atribucion: { deLaPersona: "si", metodo: "la_fuente_busca_por_identificacion" },
    });
  }

  const sinRespuesta = respuestaDe(crudo, "basesInternas");
  if (sinRespuesta !== "contesto") {
    for (const c of CATALOGO) h.sinValor(c.codigo, "inst.operacion@1", FUENTES, sinRespuesta);
    return;
  }

  const respuesta = [refDeRespuesta(crudo, consulta, "basesInternas", LISTA)];
  const elegida = elegirOperacion(operaciones);

  // ---- Los siete campos: la operación elegida, y las otras descartadas ----
  const descartadas: Descarte[] = elegida
    ? operaciones.filter((f) => f !== elegida).map((f) => {
      const { motivo, campo } = motivoDeDescarte(elegida, f);
      return { registro: refDeFila(consulta, f, campo), motivo };
    })
    : [];
  const deLaElegida = (cod: string, campo: string, valor: string | number | boolean | null, opciones: { regla?: string } = {}) => {
    const regla = opciones.regla ?? "inst.operacion@1";
    const registros: RefDeRegistro[] = [refDeFila(consulta, elegida!, campo)];
    const extra = { descartados: descartadas, entidades: [claves.get(elegida!)!] };
    if (valor === null) {
      // El campo no vino en la operación elegida: no es lo mismo que «no hay
      // operación», y la cita dice cuál fila no lo trae.
      emisor.hecho({ codigo: cod, regla, unidad: CATALOGO.find((c) => c.codigo === cod)!.unidad, valor: null, calidad: "no_disponible", motivo: "la_fuente_no_lo_informa", fuentes: FUENTES, fechaDelDato: corteDeLaFila(elegida!), registros, ...extra });
      return;
    }
    h.confirmado(cod, regla, FUENTES, valor, registros, corteDeLaFila(elegida!), extra);
  };

  if (!elegida) {
    // Sin operaciones: la fuente contestó y no hay. «No es cliente» es un valor;
    // lo demás no aplica.
    h.confirmado("inst.es_cliente", "inst.operacion@1", FUENTES, false, respuesta, null);
    for (const cod of ["inst.operacion.estado", "inst.operacion.saldo", "inst.mora.dias_vigente", "inst.mora.dias_max", "inst.habito_de_pago", "inst.perfil_interno"]) {
      h.sinValor(cod, "inst.operacion@1", FUENTES, "no_aplica");
    }
  } else {
    const r = elegida.r;
    deLaElegida("inst.operacion.estado", "estadoOperacion", textoDe(r.estadoOperacion));
    deLaElegida("inst.operacion.saldo", "saldoCapital", num(r.saldoCapital));
    deLaElegida("inst.mora.dias_vigente", "diasMoraVigentes", num(r.diasMoraVigentes));
    deLaElegida("inst.mora.dias_max", "diasMoraMax", num(r.diasMoraMax));
    deLaElegida("inst.habito_de_pago", "resultadoHabitoPago", (r.resultadoHabitoPago as string | number | boolean | null | undefined) ?? null);
    deLaElegida("inst.perfil_interno", "perfilInterno", (r.perfilInterno as string | number | boolean | null | undefined) ?? null);
    // Boolean() de la identificación, como process.ts: una fila sin ella no es un cliente.
    deLaElegida("inst.es_cliente", "identificacion", Boolean(r.identificacion));
  }

  // ---- Los tres nuevos: miden, no se suman (D5) ----
  const todas = operaciones.map((f) => refDeFila(consulta, f));
  const vigentes = operaciones.filter((f) => !esCancelada(f.r));
  const entidadesDe = (filas: Fila[]) => filas.map((f) => claves.get(f)!);
  h.confirmado("inst.operaciones.cantidad", "inst.conteo@1", FUENTES, operaciones.length, todas.length ? todas : respuesta, corteMasAntiguoDe(operaciones), { entidades: entidadesDe(operaciones) });
  const regVigentes = vigentes.map((f) => refDeFila(consulta, f, "estadoOperacion"));
  h.confirmado("inst.operaciones.vigentes", "inst.conteo@1", FUENTES, vigentes.length, regVigentes.length ? regVigentes : respuesta, corteMasAntiguoDe(vigentes), { entidades: entidadesDe(vigentes) });

  const conDias = operaciones.filter((f) => num(f.r.diasMoraMax) !== null);
  if (!conDias.length) h.sinValor("inst.mora.dias_max_entre_todas", "inst.max@1", FUENTES, operaciones.length ? "la_fuente_no_lo_informa" : "no_aplica");
  else {
    const valor = Math.max(...conDias.map((f) => num(f.r.diasMoraMax)!));
    const conMax = conDias.find((f) => num(f.r.diasMoraMax) === valor)!;
    h.confirmado("inst.mora.dias_max_entre_todas", "inst.max@1", FUENTES, valor, [refDeFila(consulta, conMax, "diasMoraMax")], corteDeLaFila(conMax), { entidades: [claves.get(conMax)!] });
  }

  diferenciasConBancos(crudo, consulta, vigentes, claves, emisor);
}

// ---- La operación con la institución que también reporta un banco (E9, punto 3) ----
//
// La institución reporta sus créditos a la Superintendencia por medio de un banco, y la
// deuda de bancos del perfil ya los incluye. Medido el 2026-11-20 sobre las 3.766 personas
// (2.529 con una operación vigente con saldo): 1.606 tienen una fila de bancos en la
// ventana de abajo, 1.570 de ellas de una misma entidad bancaria; con la lista de
// bancos de OTRA persona, la misma regla da 91 (scripts/medir-conciliacion.mjs). La regla del
// negocio (2026-11-09) es no sumar ni restar: esto no cambia ningún valor, sólo deja
// dicho qué fila de bancos puede ser la misma deuda, para que nadie la sume después.
//
// La ventana: la lista de bancos tiene el corte de un mes antes que la institución
// (agosto contra septiembre), así que debe entre el saldo de hoy y el saldo más una
// cuota; con el mismo corte, el saldo a un dólar. La fila de bancos es por entidad y
// calificación, no por operación: con dos vigentes, una sola fila puede traer las dos
// (236 personas), y por eso se mira también la suma. Una fila que junta la operación con
// otro crédito del mismo banco no se ve: no se inventa la parte de cada uno.
//
// La lectura es «esperada» con una sola fila candidata y «revisar» con más de una: no se
// sabe cuál es.
const TOLERANCIA_EN_BANCOS_USD = 1;

function diferenciasConBancos(crudo: AnyRecord, consulta: string, vigentes: Fila[], claves: Map<Fila, Entidad["clave"]>, emisor: Emisor): void {
  const conSaldo = vigentes.filter((f) => (num(f.r.saldoCapital) ?? 0) > 0);
  if (!conSaldo.length) return;
  const bancos = [...filasDe(crudo, "buroCreditoSuper", "datosSuper"), ...filasDe(crudo, "buroCreditoDiners", "datosSuper")].filter((f) => !esGarantia(f.r));
  const enLaVentana = (saldo: number, cuota: number) =>
    bancos
      .filter((b) => deudaDe(b.r) > 0 && deudaDe(b.r) >= saldo - TOLERANCIA_EN_BANCOS_USD && deudaDe(b.r) <= saldo + cuota + TOLERANCIA_EN_BANCOS_USD)
      .sort((a, b) => Math.abs(deudaDe(a.r) - saldo) - Math.abs(deudaDe(b.r) - saldo));
  const emitirSi = (sobre: string, saldo: number, manda: RefDeRegistro, candidatas: Fila[]) => {
    if (!candidatas.length) return;
    const absoluta = redondear(Math.abs(deudaDe(candidatas[0].r) - saldo));
    emisor.diferencia({
      codigo: "dif.inst.posible_en_bancos",
      regla: "inst.en_bancos@1",
      sobre,
      // «Manda» la institución sólo porque es lo que se compara: ninguna de las dos reemplaza a la otra.
      manda: { fuente: "basesInternas", valor: redondear(saldo), registro: manda },
      cede: candidatas.map((b) => ({ fuente: b.fuente, valor: redondear(deudaDe(b.r)), registro: refDeFila(consulta, b) })),
      magnitud: { absoluta, relativa: Math.round((absoluta / saldo) * 10_000) / 10_000 },
      lectura: candidatas.length === 1 ? "esperada" : "revisar",
    });
  };
  const sueltas = conSaldo.filter((f) => {
    const saldo = num(f.r.saldoCapital)!;
    const candidatas = enLaVentana(saldo, num(f.r.cuotaNova) ?? 0);
    emitirSi(`${claves.get(f)}.saldoCapital`, saldo, refDeFila(consulta, f, "saldoCapital"), candidatas);
    return candidatas.length === 0;
  });
  // Con dos vigentes o más y alguna sin fila propia, la suma de todas contra una fila.
  if (conSaldo.length > 1 && sueltas.length > 0) {
    const saldo = conSaldo.reduce((s, f) => s + num(f.r.saldoCapital)!, 0);
    const cuota = conSaldo.reduce((s, f) => s + (num(f.r.cuotaNova) ?? 0), 0);
    emitirSi("inst.operaciones.vigentes", saldo, refDeRespuesta(crudo, consulta, "basesInternas", LISTA), enLaVentana(saldo, cuota));
  }
}
