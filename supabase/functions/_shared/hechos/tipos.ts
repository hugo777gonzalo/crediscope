// Los tipos de la capa de hechos (docs/capa-de-hechos.md, sección 1.2).
//
// Sólo formas: ninguna regla vive acá. Cada grupo de `grupos/` emite hechos con
// estas formas y `indice.ts` los junta. Una forma nueva sube HECHOS_VERSION.

export type Calidad =
  | "confirmado_por_tercero" // lo informa alguien que no es la persona: el banco, el empleador, el juzgado
  | "declarado" // lo dice la persona, o ella misma ante la fuente
  | "calculado" // no lo dice ninguna fuente: sale de una regla nuestra sobre otros hechos
  | "no_disponible"; // no se pudo saber; `valor` es null y `motivo` dice por qué

export type MotivoDeNoDisponible =
  | "fuente_sin_respuesta" // error o faltante: no es «no hay»
  | "fuente_deshabilitada"
  | "la_fuente_no_lo_informa"
  | "sin_buro_contratado"
  | "no_se_puede_atribuir"
  | "no_aplica";

// Un registro del crudo. `lista` e `indice` faltan si el dato es de un objeto suelto.
export interface RefDeRegistro {
  consulta: string;
  fuente: string;
  lista?: string;
  indice?: number;
  campo?: string;
}

export interface Descarte {
  registro: RefDeRegistro;
  motivo: string;
}

interface Base {
  codigo: string;
  regla: string; // "biess.union@2": id de la regla y su versión
  fechaDeLaConsulta: string; // ISO; el reloj de toda regla (nunca `new Date()`)
}

// Un elemento de una lista que el perfil guarda tal cual (los préstamos del
// IESS/BIESS de la capacidad de pago): sólo valores simples.
export type ElementoDeLista = Record<string, string | number | null>;

export interface Hecho<V = string | number | boolean | null | string[] | ElementoDeLista[]> extends Base {
  clase: "hecho";
  valor: V | null; // null sólo con calidad "no_disponible"
  unidad: "usd" | "dias" | "meses" | "anios" | "cantidad" | "fecha" | "si_no" | "texto" | "lista";
  calidad: Calidad;
  motivo?: MotivoDeNoDisponible;
  // Sólo con una fuente que no contestó (hechos-v2, estructura-v25): lo que dice
  // la regla con las fuentes que sí contestaron. Es lo que el perfil escribía
  // como si fuera el total hasta estructura-v24, y lo que el modelo sigue leyendo
  // hasta la versión mayor del marco (campos-sin-dato.ts). No es el valor: no
  // cita registros ni se recuenta.
  parcial?: V | null;
  fuentes: string[];
  fechaDelDato: string | null;
  registros: RefDeRegistro[];
  descartados?: Descarte[];
  entidades?: string[];
}

export interface VistaDeFuente<A> {
  registro: RefDeRegistro;
  fechaDelDato: string | null;
  atributos: Partial<A>;
}

export type TipoDeEntidad = "operacion" | "empleo" | "demanda" | "establecimiento";

export interface Entidad<T extends TipoDeEntidad = TipoDeEntidad, A = unknown> {
  clave: `${"op" | "emp" | "dem" | "est"}-${string}`;
  tipo: T;
  atributos: A;
  vistas: VistaDeFuente<A>[];
  union: { regla: string; criterio: "numero" | "monto_y_fecha" | "ruc" | "nombre" | "proceso" } | null;
  atribucion: {
    deLaPersona: "si" | "no" | "sin_cotejo";
    metodo: "identificacion" | "nombre" | "la_fuente_busca_por_identificacion";
    detalle?: string;
  };
}

export interface OperacionDeCredito {
  sistema: "bancos" | "tarjeta_diners" | "cooperativas" | "comercial" | "iess_biess" | "institucion";
  acreedor: string | null; // identificador: no llega al modelo
  rol: "titular" | "codeudor" | "garante";
  estado: "vigente" | "cancelada" | "terminada_sin_cierre" | null;
  fechaDeConcesion: string | null;
  montoOriginal: number | null;
  saldoPorVencer: number | null;
  saldoVencido: number | null;
  saldoNoDevenga: number | null;
  saldoEnDemanda: number | null;
  saldoCastigado: number | null;
  diasDeMora: number | null;
  calificacion: string | null;
  cuotaMensual: number | null;
}

export interface Diferencia extends Base {
  clase: "diferencia";
  sobre: string;
  manda: { fuente: string; valor: number | string | null; registro: RefDeRegistro };
  cede: Array<{ fuente: string; valor: number | string | null; registro: RefDeRegistro }>;
  magnitud: { absoluta: number | null; relativa: number | null };
  lectura: "esperada" | "revisar";
}

export interface Senal extends Base {
  clase: "senal";
  tipo: "recencia" | "tendencia" | "razon" | "estabilidad" | "atenuante" | "lectura";
  valor: number | boolean | string | null;
  estado: "se_cumple" | "no_se_cumple" | "no_se_puede_medir";
  derivaDe: string[];
  ventana?: { desde: string; hasta: string };
  texto?: string;
}

export interface Contexto {
  cedula: string;
  consulta: string;
  fechaDeLaConsulta: string; // `capturadoEl` del crudo; es el reloj
  corteIess: string;
  persona: { nombre: string | null; fechaDeNacimiento: string | null };
}

export interface HechosDeLaPersona {
  version: string;
  contexto: Contexto;
  hechos: Hecho[];
  entidades: Entidad[];
  diferencias: Diferencia[];
  senales: Senal[];
}

// Lo que cada grupo declara de sus códigos (sección 1.1).
export interface CodigoDelCatalogo {
  codigo: string;
  unidad: Hecho["unidad"];
  descripcion: string;
  campoDelPerfil?: string;
  llegaAlModelo: boolean;
  esIdentificador: boolean;
  // Lo que el perfil escribe hoy cuando el hecho no tiene valor (la fuente no
  // contestó, o no hay registros a los que aplicar la regla): con esto
  // perfil-desde-hechos.ts reproduce el campo sin inventar un valor en el hecho.
  enElPerfilSinValor?: 0 | false | null;
  // Cómo vuelve a calcular el valor la comparación en seco, desde los registros
  // citados y con su propio código (5.1, punto 5). Sin esto no se recuenta.
  recuento?: "suma" | "conteo" | "maximo";
}

// Una diferencia contra el perfil que el negocio aprobó (5.2, punto 3).
export interface DiferenciaEsperada {
  campo: string; // "comportamientoBancario.figuraEnRegistroDeudores", o "comportamientoBancario.*" para todo el grupo
  detector: string; // el id del detector del crudo que la cuenta
  aprobadaEl: string; // fecha de la aprobación del negocio
  motivo: string;
  // "sin_dato": sólo vale para un campo que el perfil nuevo marca en
  // camposSinDato (estructura-v25); en cualquier otro, la diferencia es un error.
  // "union": sólo vale en quien tiene una entidad unida por `regla`
  // (estructura-v26, Super y Diners); en cualquier otro, la diferencia es un error.
  cuando?: "sin_dato" | "union";
  regla?: string; // con cuando "union": la regla de la unión ("ban.union@1")
}
