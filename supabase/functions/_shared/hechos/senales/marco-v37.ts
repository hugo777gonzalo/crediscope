// Lo que la versión mayor del marco (v37) sacaría de marco-v36 cuando el perfil del
// modelo traiga las lecturas (docs/capa-de-hechos.md, 11.3). Es una lista, no un cambio:
// marco-v36 no se toca y el mensaje al modelo sigue igual byte a byte.
//
// Cada tramo se marca como en marco-con-buro (`aplicarCortes`): empieza en `desde` y
// termina justo antes de `hasta`, y cada marca está UNA vez en MARCO_INTERPRETATIVO. Si
// alguien edita el marco y una marca deja de estar, la prueba lo dice: la lista sigue
// siendo exacta o falla, nunca queda vieja en silencio.
//
// Los tramos son del marco sin el buró. La sección del buró (GRUPOS_DEL_BURO_EQUIFAX)
// tiene sus propias lecturas, que esperan el contrato neutro del buró (sección 7): no
// están acá.

export interface TramoDelMarco {
  id: string;
  parrafos: string[]; // del inventario (capa-de-hechos.md, 11.1)
  desde: string;
  hasta: string;
  // Lo que llegaría al modelo en su lugar: códigos de lectura, o «perfil» cuando lo
  // resuelve la forma del perfil del modelo (un campo que se saca, un bloque que dice
  // qué suma) y no una lectura.
  reemplazo: string[];
  // El criterio que el tramo mezclaba y que la v37 tiene que conservar, en una línea.
  queda: string | null;
}

export const TRAMOS_QUE_SACA_LA_V37: TramoDelMarco[] = [
  {
    id: "V01",
    parrafos: ["P10", "P11"],
    desde: "   - A1 es la única de la escala sin atraso",
    hasta: "   - tieneOperacionConDemanda y tieneOperacionCastigada",
    reemplazo: ["lec.ban.calificacion.tramo", "lec.ban.atraso_sin_monto"],
    queda: null,
  },
  {
    id: "V02",
    parrafos: ["P13", "P14"],
    desde: "   - saldoTotalVigente es lo por vencer.",
    hasta: "   - Deuda como codeudor o garante:",
    reemplazo: ["lec.ban.deuda.toda_en_atraso", "lec.ban.atraso_sin_monto", "perfil"],
    queda: null,
  },
  {
    id: "V03",
    parrafos: ["P15"],
    desde: "   - Deuda como codeudor o garante:",
    hasta: "   - numeroPrestamosIessBiess y diasMoraCreditoIessBiess son préstamos\n",
    reemplazo: ["lec.ban.garante.contingente"],
    queda: null,
  },
  {
    id: "V04",
    parrafos: ["P16"],
    desde: "   - numeroPrestamosIessBiess y diasMoraCreditoIessBiess son préstamos\n",
    hasta: "   - Retail (numeroDeudasRetail",
    reemplazo: ["perfil"],
    queda: null,
  },
  {
    id: "V05",
    parrafos: ["P17", "P18"],
    desde: "   - Retail (numeroDeudasRetail",
    hasta: "\n\n4. comportamientoCooperativas",
    reemplazo: ["lec.ret.deuda.toda_vencida", "lec.ret.a_su_corte", "perfil"],
    queda: null,
  },
  {
    id: "V06",
    parrafos: ["P20", "P21"],
    desde: "; misma nota",
    hasta: "\n\n   endeudamiento (bloque",
    reemplazo: ["lec.coop.atraso_de_hoy", "perfil"],
    queda: null,
  },
  {
    id: "V07",
    parrafos: ["P23"],
    desde: " La cuota\n   conocida es sólo la de cooperativas",
    hasta: "\n\n5. riesgoJudicialCrediticio",
    reemplazo: ["lec.end.cuota_incompleta", "lec.end.cuota_sobre_ingreso"],
    queda: null,
  },
  {
    id: "V08",
    parrafos: ["P25"],
    desde: "   - demandasDeCobro trae cada una con su año",
    hasta: "Una demanda de más\n     de 2 años pesa menos",
    reemplazo: ["lec.jud.cobro.mas_reciente", "lec.jud.cobro.de_institucion_financiera"],
    queda: null,
  },
  {
    id: "V09",
    parrafos: ["P25"],
    desde: " Sin demandasDeCobro\n",
    hasta: "\n\n6. riesgoJudicialCivil",
    reemplazo: ["lec.jud.cobro.mas_reciente"],
    queda: null,
  },
  {
    id: "V10",
    parrafos: ["P27"],
    desde: "   - \"Investigación penal cerrada sin cargos\"",
    hasta: "   - \"Otras\": no se sabe",
    reemplazo: ["lec.jud.civil.cuentan"],
    queda: null,
  },
  {
    id: "V11",
    parrafos: ["P29"],
    desde: "   - En perfiles anteriores (sin demandasPorCategoria)",
    hasta: "   - numeroDemandasComoOfendido es sólo contexto",
    reemplazo: ["perfil"],
    queda: null,
  },
  {
    id: "V12",
    parrafos: ["P31", "P32"],
    desde: "   - Pensión alimenticia: mirá primero",
    hasta: "\n\n7. riesgoPenal",
    reemplazo: ["lec.jud.pension.estado", "lec.jud.pension.gasto_mensual"],
    queda: "Una pensión en mora pesa como una demanda de cobro; al día no es negativo.",
  },
  {
    id: "V13",
    parrafos: ["P07"],
    desde: "   impedimentoCargosPublicos: mirá siempre causalImpedimento",
    hasta: "\n\n2. riesgoSeguridadCiudadana",
    reemplazo: ["lec.cum.impedimento.causa"],
    queda: "Por deuda con el Estado es «revisar» con una acción para verificarla, y pesa para negar sólo junto con problemas de pago; otra causa no es un negativo.",
  },
  {
    id: "V14",
    parrafos: ["P38"],
    desde: "   - Jubilados: si perfilLaboral.registraJubilacion",
    hasta: "   - Militares y policías no aportan",
    reemplazo: ["lec.ing.huecos_12_meses", "lec.ing.dejo_de_aportar"],
    queda: null,
  },
  {
    id: "V15",
    parrafos: ["P39"],
    desde: "   - Militares y policías no aportan",
    hasta: "   - estado: \"Confirmado por un tercero\"",
    reemplazo: ["lec.ing.regimen_especial"],
    queda: null,
  },
  {
    id: "V16",
    parrafos: ["P46", "P47"],
    desde: "   - estabilidad.continuidadLaboral mide desde cuándo",
    hasta: "   - Qué monto usar:",
    reemplazo: ["lec.ing.continuidad", "lec.ing.huecos_12_meses", "lec.ing.variacion_anual", "lec.ing.dejo_de_aportar"],
    queda: "La continuidad laboral es mejor señal de estabilidad que la antigüedad en el empleo actual para quien cambió de trabajo sin parar.",
  },
  {
    id: "V17",
    parrafos: ["P50"],
    desde: " Si la lista\n   viene vacía",
    hasta: " Con más\n   de un empleo vigente",
    reemplazo: ["lec.lab.sin_empleo_registrado"],
    queda: null,
  },
  {
    id: "V18",
    parrafos: ["P66"],
    desde: " Esa\n      operación, si está vigente, ya consta en el buró",
    hasta: "\n    - Resaltalo siempre que llegue",
    reemplazo: ["lec.inst.ya_en_bancos"],
    queda: null,
  },
  {
    id: "V19",
    parrafos: ["P74"],
    desde: "- Si disponibilidad es null (un perfil viejo)",
    hasta: "\n\nSi notás contradicciones",
    reemplazo: ["perfil"],
    queda: null,
  },
  {
    id: "V20",
    parrafos: ["P82"],
    desde: " \"sin\n  historial\" es para quien",
    hasta: "\n\nQUÉ VA EN CADA CAMPO",
    reemplazo: ["lec.end.sin_historial"],
    queda: null,
  },
  // lecturas-v3 (2026-11-22): las tres que E11 dejó pendientes.
  {
    id: "V21",
    parrafos: ["P53"],
    desde: "   - empleadorConApellidoDelCliente:",
    hasta: "   - clienteEsSuPropioEmpleador:",
    reemplazo: ["lec.lab.posible_negocio_familiar"],
    queda: "Un posible negocio familiar no es negativo por sí solo: un rol de pagos que firma un pariente se verifica distinto, así que si el caso depende de ese ingreso se pide respaldo adicional, y se presenta como algo a verificar, nunca como un hecho.",
  },
  {
    id: "V22",
    parrafos: ["P54"],
    desde: "   - clienteEsSuPropioEmpleador:",
    hasta: "   - antiguedadEmpleoActualMeses es señal",
    reemplazo: ["lec.lab.empleos_con_terceros"],
    queda: "Ser su propio patrono es trabajo por cuenta propia formalizado, no un empleo familiar: se lee junto con el RUC activo y la actividad independiente.",
  },
  {
    id: "V23",
    parrafos: ["P63"],
    desde: "\n    nivelEducacion es la única excepción parcial",
    hasta: "\n\n13. contacto",
    reemplazo: ["lec.ide.tercer_o_cuarto_nivel"],
    queda: "Un tercer o cuarto nivel es un atenuante leve de capacidad, nunca una regla dura, y no tenerlo no es negativo.",
  },
];

// Dónde empieza y termina cada tramo en un texto. Corta si una marca no está o está más de
// una vez, o si dos tramos se pisan: la misma regla que `aplicarCortes`.
export function ubicarTramos(texto: string, tramos: TramoDelMarco[] = TRAMOS_QUE_SACA_LA_V37): Array<{ id: string; inicio: number; fin: number }> {
  const unaVez = (marca: string, id: string) => {
    const i = texto.indexOf(marca);
    if (i < 0 || texto.indexOf(marca, i + 1) >= 0) throw new Error(`${id}: la marca no está, o está más de una vez: ${JSON.stringify(marca.slice(0, 50))}`);
    return i;
  };
  const ubicados = tramos.map((t) => {
    const inicio = unaVez(t.desde, t.id);
    const fin = unaVez(t.hasta, t.id);
    if (fin <= inicio) throw new Error(`${t.id}: termina antes de empezar`);
    return { id: t.id, inicio, fin };
  });
  const ordenados = [...ubicados].sort((a, b) => a.inicio - b.inicio);
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].inicio < ordenados[i - 1].fin) throw new Error(`${ordenados[i - 1].id} y ${ordenados[i].id} se pisan`);
  }
  return ubicados;
}
