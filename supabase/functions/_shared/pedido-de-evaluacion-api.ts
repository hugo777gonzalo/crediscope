// El pedido de `POST /evaluaciones` (api/openapi.yaml, PedidoDeEvaluacion): la
// validación de la puerta de la API.
//
// La especificación dice `additionalProperties: false` en cada objeto y marca
// obligatorios la persona, la autorización, la referencia y el operador. La
// pantalla del analista no manda esos datos, así que `validarPedidoDeSolicitud`
// (modalidades.ts) los deja opcionales; acá se exigen. Lo demás (las condiciones
// del crédito, el Ingreso declarado, la forma de la autorización) lo valida esa
// misma función: una sola regla para la pantalla y para la API.
//
// Un campo de más es un error, no se ignora: una institución que manda
// `documento` con el PDF de la autorización tiene que enterarse de que no se
// guarda, en vez de creer que CrediScope lo conserva.
//
// Función pura: la usan la puerta y las pruebas.

import { clasificarIdentificacion } from "./identificacion.ts";
import { type ErrorDeCampo } from "./datos-de-la-solicitud.ts";
import { type PedidoDeSolicitud, validarPedidoDeSolicitud } from "./modalidades.ts";
import { uuidDeLaEvaluacion } from "./cola-de-evaluaciones.ts";
import { esCasoDelSandbox } from "./sandbox-casos.ts";

export interface PedidoDeLaApi extends PedidoDeSolicitud {
  /** La cédula con la que se consulta (un RUC de persona natural ya viene reducido). */
  identificacion: string;
  /** Lo que escribió la institución, para la auditoría. */
  ingresado: string;
  recibirPerfil: boolean;
}

export type ResultadoDelPedido =
  | { ok: true; pedido: PedidoDeLaApi }
  | { ok: false; codigo: "cuerpo-invalido" | "identificacion-invalida" | "autorizacion-insuficiente"; detalle: string; errores: ErrorDeCampo[] };

const CLAVES_DEL_PEDIDO = ["persona", "autorizacion", "solicitudDeCredito", "modalidad", "referencia", "operador", "prioridad", "recibirPerfil", "reemplazaA"];
const CLAVES_DE_LA_PERSONA = ["tipoIdentificacion", "identificacion"];
const CLAVES_DE_LA_SOLICITUD = ["producto", "monto", "moneda", "plazoMeses", "destino", "garantia", "tasaNominalAnualPorcentaje", "sistema", "desgravamen", "ingresoDeclarado"];
const CLAVES_DE_LA_AUTORIZACION = ["id", "otorgadaEl", "vigenteHasta", "canal", "finalidad", "huellaDelDocumento"];
const CLAVES_DEL_OPERADOR = ["id", "agencia"];
const PRODUCTOS = ["consumo", "microcredito", "productivo", "educativo", "inmobiliario", "vivienda_interes_social_publico", "otro"];

const esObjeto = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// RFC 6901: «~» y «/» dentro de un nombre se escriben «~0» y «~1».
const puntero = (nombre: string) => nombre.replaceAll("~", "~0").replaceAll("/", "~1");

function clavesDeMas(objeto: Record<string, unknown>, permitidas: string[], base: string, errores: ErrorDeCampo[]) {
  for (const clave of Object.keys(objeto)) {
    if (!permitidas.includes(clave)) errores.push({ campo: `${base}/${puntero(clave)}`, motivo: "Este campo no existe en la especificación de la API." });
  }
}

function erroresDeLasCondicionesGuardadas(sc: Record<string, unknown>, errores: ErrorDeCampo[]) {
  const mal = (campo: string, motivo: string) => errores.push({ campo: `/solicitudDeCredito/${campo}`, motivo });
  const { monto, plazoMeses, tasaNominalAnualPorcentaje: tasa, sistema } = sc;
  if (monto !== undefined && (typeof monto !== "number" || !(monto > 0) || monto > 1_000_000_000 || Math.abs(monto * 100 - Math.round(monto * 100)) > 1e-6)) {
    mal("monto", "El monto es mayor que cero, de hasta 1.000.000.000 de dólares y con a lo sumo dos decimales.");
  }
  if (plazoMeses !== undefined && (typeof plazoMeses !== "number" || !Number.isInteger(plazoMeses) || plazoMeses < 1 || plazoMeses > 480)) {
    mal("plazoMeses", "El plazo es un número entero de meses, de 1 a 480.");
  }
  if (tasa !== undefined && (typeof tasa !== "number" || !(tasa >= 0) || tasa > 15.6)) mal("tasaNominalAnualPorcentaje", "La tasa nominal anual va de 0 a 15,6 por ciento.");
  if (sistema !== undefined && sistema !== "frances" && sistema !== "aleman") mal("sistema", "El sistema de amortización es «frances» o «aleman».");
  const d = sc.desgravamen;
  if (d !== undefined) {
    const ok = esObjeto(d) && typeof d.tasaPorcentaje === "number" && d.tasaPorcentaje >= 0 && (d.periodicidad === "anual" || d.periodicidad === "mensual") && (d.base === "saldo" || d.base === "monto") &&
      Object.keys(d).every((k) => ["tasaPorcentaje", "periodicidad", "base"].includes(k));
    if (!ok) mal("desgravamen", "El seguro de desgravamen trae tasaPorcentaje (no negativa), periodicidad («anual» o «mensual») y base («saldo» o «monto»).");
  }
}

function erroresDeLosTextosGuardados(sc: Record<string, unknown>, errores: ErrorDeCampo[]) {
  for (const nombre of ["destino", "garantia"]) {
    const valor = sc[nombre];
    if (valor !== undefined && (typeof valor !== "string" || valor.length > 200)) {
      errores.push({ campo: `/solicitudDeCredito/${nombre}`, motivo: `El campo ${nombre} es un texto de hasta 200 caracteres.` });
    }
  }
}

// La huella del pedido, para saber si quien repite una clave de idempotencia
// manda lo mismo (un reintento) o otra cosa (un error suyo, 409). Con las claves
// ordenadas: el orden en que la institución arma el JSON no es un cambio.
export async function huellaDelPedido(cuerpo: unknown): Promise<string> {
  const normal = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(normal)
      : v && typeof v === "object"
      ? Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, normal((v as Record<string, unknown>)[k])]))
      : v;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(normal(cuerpo))));
  return "sha256:" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// `sandbox`: si el interruptor de la puerta está encendido (API_SANDBOX). Apagado,
// una identificación de prueba es inválida, como dice la especificación de producción.
export function validarPedidoDeLaApi(cuerpo: unknown, ahora: Date = new Date(), opciones: { sandbox?: boolean } = {}): ResultadoDelPedido {
  if (!esObjeto(cuerpo)) {
    return { ok: false, codigo: "cuerpo-invalido", detalle: "El cuerpo tiene que ser un objeto JSON.", errores: [{ campo: "", motivo: "El cuerpo tiene que ser un objeto JSON." }] };
  }
  const errores: ErrorDeCampo[] = [];
  clavesDeMas(cuerpo, CLAVES_DEL_PEDIDO, "", errores);

  // Los objetos anidados: sus campos de más, y que sea un objeto cuando viene.
  for (const [clave, permitidas] of [["autorizacion", CLAVES_DE_LA_AUTORIZACION], ["operador", CLAVES_DEL_OPERADOR], ["solicitudDeCredito", CLAVES_DE_LA_SOLICITUD]] as const) {
    if (esObjeto(cuerpo[clave])) clavesDeMas(cuerpo[clave] as Record<string, unknown>, permitidas, `/${clave}`, errores);
  }

  for (const obligatorio of ["autorizacion", "referencia", "operador"]) {
    if (cuerpo[obligatorio] === undefined || cuerpo[obligatorio] === null) {
      errores.push({ campo: `/${obligatorio}`, motivo: "Es obligatorio en la API: sin la autorización del titular no se consulta a nadie, y la referencia y el operador responden «¿quién vio mis datos?»." });
    }
  }

  // La persona.
  let identificacion: ReturnType<typeof clasificarIdentificacion> | null = null;
  const persona = cuerpo.persona;
  if (!esObjeto(persona)) {
    errores.push({ campo: "/persona", motivo: "Es obligatoria: tipoIdentificacion e identificacion." });
  } else {
    clavesDeMas(persona, CLAVES_DE_LA_PERSONA, "/persona", errores);
    const tipo = persona.tipoIdentificacion;
    const numero = persona.identificacion;
    if (tipo !== "cedula" && tipo !== "ruc") errores.push({ campo: "/persona/tipoIdentificacion", motivo: "El tipo de identificación es «cedula» o «ruc»." });
    if (typeof numero !== "string" || !/^[0-9]{10}([0-9]{3})?$/.test(numero)) {
      errores.push({ campo: "/persona/identificacion", motivo: "La identificación son 10 dígitos (cédula) o 13 (RUC), sin espacios ni guiones." });
    } else if (tipo === "cedula" && numero.length !== 10) {
      errores.push({ campo: "/persona/identificacion", motivo: "Una cédula tiene 10 dígitos." });
    } else if (tipo === "ruc" && numero.length !== 13) {
      errores.push({ campo: "/persona/identificacion", motivo: "Un RUC tiene 13 dígitos." });
    } else if (tipo === "cedula" && opciones.sandbox === true && esCasoDelSandbox(numero)) {
      identificacion = { tipo: "cedula", ingresado: numero, cedula: numero, consultable: true, mensaje: "" };
    } else if (tipo === "cedula" || tipo === "ruc") {
      identificacion = clasificarIdentificacion(numero);
    }
  }

  if (cuerpo.recibirPerfil !== undefined && typeof cuerpo.recibirPerfil !== "boolean") {
    errores.push({ campo: "/recibirPerfil", motivo: "recibirPerfil es verdadero o falso." });
  }

  // reemplazaA viaja como `ev_...`; por dentro es el uuid de la solicitud.
  let reemplazaA: string | null | undefined = undefined;
  if (cuerpo.reemplazaA !== undefined && cuerpo.reemplazaA !== null) {
    reemplazaA = uuidDeLaEvaluacion(cuerpo.reemplazaA);
    if (!reemplazaA) errores.push({ campo: "/reemplazaA", motivo: "Es el id de una evaluación: «ev_» y 26 caracteres." });
  }

  // La modalidad, que sin decir nada es la básica.
  const modalidad = cuerpo.modalidad === undefined ? "basico" : cuerpo.modalidad;
  const interno = { modalidad, solicitudDeCredito: cuerpo.solicitudDeCredito, autorizacion: cuerpo.autorizacion, referencia: cuerpo.referencia, operador: cuerpo.operador, prioridad: cuerpo.prioridad, reemplazaA };
  const v = validarPedidoDeSolicitud(interno, ahora);
  if (!v.ok) {
    // «Obligatorio» ya se dijo arriba para lo que falta: no se repite.
    for (const e of v.detalle) if (!errores.some((x) => x.campo === e.campo)) errores.push(e);
  } else {
    const sc = esObjeto(cuerpo.solicitudDeCredito) ? cuerpo.solicitudDeCredito : null;
    if (sc) {
      if (sc.producto !== undefined && !PRODUCTOS.includes(sc.producto as string)) errores.push({ campo: "/solicitudDeCredito/producto", motivo: `El producto es uno de: ${PRODUCTOS.join(", ")}.` });
      if (sc.moneda !== undefined && sc.moneda !== "USD") errores.push({ campo: "/solicitudDeCredito/moneda", motivo: "La única moneda es USD." });
      // Los cálculos de pro y plus usan los parámetros del producto de consumo.
      if (v.pedido.condiciones && sc.producto !== undefined && sc.producto !== "consumo") {
        errores.push({ campo: "/solicitudDeCredito/producto", motivo: "Por ahora la capacidad de pago sólo se calcula para el producto de consumo." });
      }
      // Lo que sólo se guarda va a columnas con sus límites: un texto de 300
      // caracteres no puede llegar a la base como un error 500. En pro y plus el
      // monto, el plazo, la tasa y el desgravamen ya los validó el simulador.
      erroresDeLosTextosGuardados(sc, errores);
      if (!v.pedido.condiciones) erroresDeLasCondicionesGuardadas(sc, errores);
    }
  }

  // Lo estructural primero. Una identificación que no pasa el dígito verificador
  // es lo único que tiene su propio código (`identificacion-invalida`), y se
  // informa sola cuando es el único problema del pedido.
  if (identificacion && !identificacion.consultable) {
    if (errores.length === 0) {
      return { ok: false, codigo: "identificacion-invalida", detalle: identificacion.mensaje, errores: [{ campo: "/persona/identificacion", motivo: identificacion.mensaje }] };
    }
    errores.push({ campo: "/persona/identificacion", motivo: identificacion.mensaje });
  }

  if (errores.length > 0 || !v.ok || !identificacion) {
    // Una autorización vencida es lo único mal: no es un pedido malformado sino
    // una autorización que no alcanza (422), y la institución decide distinto.
    if (errores.length === 1 && errores[0].codigo === "autorizacion-vencida") {
      return { ok: false, codigo: "autorizacion-insuficiente", detalle: errores[0].motivo, errores };
    }
    return { ok: false, codigo: "cuerpo-invalido", detalle: "El pedido no cumple la especificación de la API.", errores };
  }
  return {
    ok: true,
    pedido: { ...v.pedido, identificacion: identificacion.cedula as string, ingresado: identificacion.ingresado, recibirPerfil: cuerpo.recibirPerfil !== false },
  };
}
