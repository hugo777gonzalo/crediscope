// Grupo «seguridad social» de la capa de hechos (docs/capa-de-hechos.md, 4.5): los diez campos de
// `seguridadSocial`. Salen de siete fuentes: la afiliación al IESS (`afiliacionIess`), la jubilación
// (`jubilados`), la pensión (`pensionista`), la cobertura de salud de las tres entidades
// (`afiliacionSalud`) y el seguro social militar y el policial (`afiliacionIssfacCertMedico`,
// `afiliacionIssfacFuerzaArmada`, `afiliacionSiisspol`).
//
// ETAPA A. process.ts sigue armando `seguridadSocial` como siempre, y estas reglas son una copia de las
// suyas mientras dure (3.3): la comparación en seco y la paridad sobre los crudos inventados corren en
// cada PR. La lectura de militares y policías no se copia: es la de fuerzas-armadas-policia.ts
// (`lecturasMilitaresOPoliciales()`), la misma de la que sale `servicioMilitarOPolicial()` para el perfil
// y para la clasificación de ingresos.
//
// POR QUÉ ESTE GRUPO. El marco (P60 en 11.1) le explica al modelo que «afiliadoIessActivo=null (distinto
// de false) es un hueco de esa fuente puntual»: es una lectura que el código ya sabe y el perfil no dice.
// En la etapa B el campo queda null y en `camposSinDato`, como en los demás grupos, y el marco deja de
// necesitar la regla.
//
// UNA FUENTE QUE NO CONTESTÓ NO ES UNA FUENTE QUE DICE «NO HAY». Cada hecho sin su fuente queda sin
// valor y con el `parcial`, lo que la regla dice con las filas que llegaron, que es lo que process.ts
// escribe hoy. Dos campos no tienen parcial porque process.ts ya escribe null sin su fuente:
// `afiliadoIessActivo` y `tieneCoberturaSalud`.
//
// `afiliacionIess` contesta `faltante` para casi todos (2.431 de 2.567 en el respaldo del 2026-10-03), y
// FUENTES (calidad-de-la-consulta.ts) lo toma como su «no hay». El perfil no: desde la auditoría de
// c-ba4c16f0 y c-18fa16ee, un `faltante` es null, porque traía `false` («no afiliado») a personas con
// empleo confirmado por otras fuentes. Acá se sigue al perfil (`fuente_sin_respuesta`): es lo que dice
// P60. Que las dos lecturas se contradigan es una decisión pendiente para la etapa B.
//
// `afiliacionIssfacFuerzaArmada` está apagada en la práctica (da `faltante` siempre: 2.567 de 2.567) y es
// secundaria: no cuenta como caída, igual que en el grupo de ingresos. Sólo cuentan las dos obligatorias
// del seguro militar y el policial.

import { ayudanteDelGrupo, type Emisor } from "../emisor.ts";
import { type AnyRecord, citar, type Fila, filasDe, ref, refDeFila, refDeRespuesta, respuestaDe, textoDe } from "../lectura-del-crudo.ts";
import type { CodigoDelCatalogo, Contexto, Descarte, MotivoDeNoDisponible, RefDeRegistro } from "../tipos.ts";
import { descripcionDelServicio, type LecturaMilitarPolicial, lecturaQueDecide, lecturasMilitaresOPoliciales } from "../../fuerzas-armadas-policia.ts";

const SS = "seguridadSocial.";

function codigo(cod: string, unidad: CodigoDelCatalogo["unidad"], descripcion: string, campo: string, enSinValor: CodigoDelCatalogo["enElPerfilSinValor"]): CodigoDelCatalogo {
  return { codigo: cod, unidad, descripcion, llegaAlModelo: true, esIdentificador: false, campoDelPerfil: SS + campo, enElPerfilSinValor: enSinValor };
}

export const CATALOGO: CodigoDelCatalogo[] = [
  codigo("ss.iess.afiliado_activo", "si_no", "Afiliado activo al IESS: el estado de su afiliación empieza con «ACTIVO»", "afiliadoIessActivo", null),
  codigo("ss.iess.estado_afiliacion", "texto", "Estado de la afiliación al IESS, como lo escribe la fuente", "estadoAfiliacionIess", null),
  codigo("ss.pensionista.es", "si_no", "Registra una pensión del IESS vigente (algún registro con estado verdadero)", "esPensionista", false),
  codigo("ss.jubilado.es", "si_no", "Registra una jubilación del IESS", "esJubilado", false),
  codigo("ss.salud.tiene_cobertura", "si_no", "Alguna de las tres entidades (IESS, ISSFA, ISSPOL) registra su cobertura de salud", "tieneCoberturaSalud", null),
  codigo("ss.salud.entidades", "lista", "Entidades que registran su cobertura de salud", "entidadesSaludConCobertura", null),
  codigo("ss.salud.tipo_seguro", "texto", "Tipo de seguro de salud de la primera entidad que registra su cobertura", "tipoSeguroSalud", null),
  codigo("ss.militar.titular", "si_no", "Militar en servicio activo o pasivo, titular (no un familiar cubierto ni un montepío)", "afiliadoSeguridadMilitar", false),
  codigo("ss.policia.titular", "si_no", "Policía en servicio activo o pasivo, titular (no un familiar cubierto ni un montepío)", "afiliadoSeguridadPolicial", false),
  codigo("ss.servicio.militar_o_policial", "texto", "Servicio militar o policial en palabras: activo, pasivo (retirado) o beneficiario de montepío", "servicioMilitarOPolicial", null),
];

// Las que eligen o descartan registros. Un crudo inventado en que aplica y uno en que no.
export const REGLAS_QUE_MEZCLAN: string[] = [
  "ss.iess@1", // con más de un registro de afiliación lee el primero (2 personas de 2.567 traen dos)
  "ss.pensionista@1", // cuenta sólo los registros con estado verdadero
  "ss.salud@1", // cuenta sólo las entidades que registran cobertura; el tipo, de la primera
  "ss.militar_policial@1", // descarta familiares y registros de otra persona; si hay varios, pesa el servicio activo
];

const IESS: [string, string] = ["afiliacionIess", "afiliacionIess"];
const PENSIONISTA: [string, string] = ["pensionista", "pensionista"];
const JUBILADOS: [string, string] = ["jubilados", "trabajos"];
const SALUD: [string, string] = ["afiliacionSalud", "afiliacionSalud"];
const FUENTES_MILITARES = ["afiliacionIssfacCertMedico", "afiliacionIssfacFuerzaArmada", "afiliacionSiisspol"];
// Las que cuentan como caídas: las obligatorias (FUENTES). La de Fuerza Armada no (ver arriba).
const MILITARES_QUE_CUENTAN = ["afiliacionIssfacCertMedico", "afiliacionSiisspol"];

type Valor = string | boolean | string[] | null;

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  const consulta = contexto.consulta;
  const h = ayudanteDelGrupo(emisor, CATALOGO);

  // La primera fuente que no contestó, de las que cuentan; null si contestaron todas.
  const caida = (fuentes: string[]): MotivoDeNoDisponible | null => {
    for (const f of fuentes) {
      const r = respuestaDe(crudo, f);
      if (r !== "contesto") return r;
    }
    return null;
  };
  // Con la fuente caída, sin valor y con el parcial (o sin él, si el perfil escribe null sin su
  // fuente). Con la fuente que contestó y sin valor, «no aplica» o «la fuente no lo informa».
  function emitirHecho(
    cod: string,
    regla: string,
    fuentes: string[],
    cuentan: string[],
    valor: Valor,
    registros: RefDeRegistro[],
    opciones: { descartados?: Descarte[]; sinParcial?: boolean; sinValor?: MotivoDeNoDisponible } = {},
  ) {
    const motivo = caida(cuentan);
    if (motivo) return void (opciones.sinParcial ? h.sinValor(cod, regla, fuentes, motivo) : h.sinValor(cod, regla, fuentes, motivo, valor));
    if (valor === null) return void h.sinValor(cod, regla, fuentes, opciones.sinValor ?? "no_aplica");
    h.confirmado(cod, regla, fuentes, valor, registros, null, { descartados: opciones.descartados });
  }
  const respuesta = (par: [string, string]) => refDeRespuesta(crudo, consulta, par[0], par[1]);
  const filas = (par: [string, string]) => filasDe(crudo, par[0], par[1]);
  const citas = (fs: Fila[], campo?: string) => fs.map((f) => refDeFila(consulta, f, campo));

  // ---- Afiliación al IESS: el primer registro ----
  const iess = filas(IESS);
  const primera = iess[0] as Fila | undefined;
  const otrasDelIess: Descarte[] = iess.slice(1).map((f) => ({ registro: refDeFila(consulta, f), motivo: "se_lee_el_primer_registro_de_afiliacion" }));
  const delEstado = primera ? [refDeFila(consulta, primera, "estado")] : [respuesta(IESS)];
  emitirHecho(
    "ss.iess.afiliado_activo", "ss.iess@1", [IESS[0]], [IESS[0]],
    primera ? String(primera.r.estado ?? "").toUpperCase().startsWith("ACTIVO") : false,
    delEstado,
    { descartados: otrasDelIess, sinParcial: true },
  );
  const estado = primera ? ((primera.r.estado as string | undefined) ?? null) : null;
  emitirHecho("ss.iess.estado_afiliacion", "ss.iess@1", [IESS[0]], [IESS[0]], estado, delEstado, {
    descartados: otrasDelIess,
    sinValor: primera ? "la_fuente_no_lo_informa" : "no_aplica",
  });

  // ---- Pensión: sólo los registros con estado verdadero ----
  const pensiones = filas(PENSIONISTA);
  const vigentes = pensiones.filter((f) => f.r.estado === true);
  emitirHecho(
    "ss.pensionista.es", "ss.pensionista@1", [PENSIONISTA[0]], [PENSIONISTA[0]],
    vigentes.length > 0,
    citar(citas(vigentes, "estado"), citas(pensiones, "estado"), [respuesta(PENSIONISTA)]),
    { descartados: vigentes.length ? pensiones.filter((f) => f.r.estado !== true).map((f) => ({ registro: refDeFila(consulta, f), motivo: "su_estado_no_es_verdadero" })) : [] },
  );

  // ---- Jubilación: cualquier registro ----
  const jubilaciones = filas(JUBILADOS);
  emitirHecho("ss.jubilado.es", "ss.jubilado@1", [JUBILADOS[0]], [JUBILADOS[0]], jubilaciones.length > 0, citar(citas(jubilaciones), [], [respuesta(JUBILADOS)]));

  // ---- Cobertura de salud: las entidades que la registran ----
  const salud = filas(SALUD);
  const conCobertura = salud.filter((f) => f.r.registraCobertura === true);
  const sinCobertura: Descarte[] = salud.filter((f) => f.r.registraCobertura !== true).map((f) => ({ registro: refDeFila(consulta, f), motivo: "no_registra_cobertura" }));
  const deLaSalud = citar(citas(conCobertura, "registraCobertura"), citas(salud, "registraCobertura"), [respuesta(SALUD)]);
  emitirHecho("ss.salud.tiene_cobertura", "ss.salud@1", [SALUD[0]], [SALUD[0]], conCobertura.length > 0, deLaSalud, {
    descartados: conCobertura.length ? sinCobertura : [],
    sinParcial: true,
  });
  const conEntidad = conCobertura.filter((f) => textoDe(f.r.entidad));
  emitirHecho(
    "ss.salud.entidades", "ss.salud@1", [SALUD[0]], [SALUD[0]],
    conEntidad.map((f) => textoDe(f.r.entidad)!),
    citar(citas(conEntidad, "entidad"), citas(salud, "registraCobertura"), [respuesta(SALUD)]),
    { descartados: conEntidad.length ? sinCobertura : [] },
  );
  const primeraConCobertura = conCobertura[0] as Fila | undefined;
  emitirHecho(
    "ss.salud.tipo_seguro", "ss.salud@1", [SALUD[0]], [SALUD[0]],
    textoDe(primeraConCobertura?.r.tipoSeguro),
    primeraConCobertura ? [refDeFila(consulta, primeraConCobertura, "tipoSeguro")] : [],
    {
      descartados: [...sinCobertura, ...conCobertura.slice(1).map((f) => ({ registro: refDeFila(consulta, f), motivo: "se_lee_la_primera_entidad_con_cobertura" }))],
      sinValor: primeraConCobertura ? "la_fuente_no_lo_informa" : "no_aplica",
    },
  );

  // ---- Militar o policía: la lectura que decide ----
  const lecturas = lecturasMilitaresOPoliciales(crudo, contexto.cedula);
  const decide = lecturaQueDecide(lecturas);
  const refDe = (l: LecturaMilitarPolicial) => ref(consulta, l.fuente, l.lista, l.indice);
  const clave = (r: RefDeRegistro) => `${r.fuente}/${r.lista}/${r.indice}`;
  const usada = decide ? clave(refDe(decide)) : null;
  const descartadas = new Map<string, Descarte>();
  for (const l of lecturas) {
    const r = refDe(l);
    if (clave(r) === usada || descartadas.has(clave(r))) continue;
    const motivo = l.deOtraPersona ? "registro_de_otra_persona" : l.servicio ? "pesa_otro_servicio_de_la_persona" : "familiar_cubierto_o_sin_servicio";
    descartadas.set(clave(r), { registro: r, motivo });
  }
  // «No es militar ni policía» lo dicen las dos que cuentan; la de Fuerza Armada, en faltante, no trae nada que citar.
  const respuestasMilitares = MILITARES_QUE_CUENTAN.filter((f) => f in crudo).map((f) => refDeRespuesta(crudo, consulta, f, f === "afiliacionSiisspol" ? "afiliacionSiisspol" : "afiliaciones"));
  const deLoMilitar = decide ? [refDe(decide)] : citar([], [...descartadas.values()].map((d) => d.registro), respuestasMilitares);
  const opcionesMilitares = { descartados: [...descartadas.values()] };
  const titular = decide !== null && decide.servicio!.situacion !== "montepio";
  emitirHecho("ss.militar.titular", "ss.militar_policial@1", FUENTES_MILITARES, MILITARES_QUE_CUENTAN, titular && decide!.servicio!.institucion === "ISSFAC", deLoMilitar, opcionesMilitares);
  emitirHecho("ss.policia.titular", "ss.militar_policial@1", FUENTES_MILITARES, MILITARES_QUE_CUENTAN, titular && decide!.servicio!.institucion === "ISSPOL", deLoMilitar, opcionesMilitares);
  emitirHecho(
    "ss.servicio.militar_o_policial", "ss.militar_policial@1", FUENTES_MILITARES, MILITARES_QUE_CUENTAN,
    descripcionDelServicio(decide?.servicio ?? null),
    deLoMilitar,
    opcionesMilitares,
  );
}
