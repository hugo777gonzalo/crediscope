// Qué es lo que alguien escribió en el campo de búsqueda.
//
// El sistema consulta personas naturales por cédula. Pero en la
// ventanilla entra de todo, y hasta ahora todo se mandaba igual a la
// fuente:
//
//   · Una cédula mal tipeada devolvía "No existe la persona", que el
//     sistema trataba igual que "esta persona no tiene datos en este
//     bloque". Resultado: un Perfil del Cliente completo y en blanco,
//     sin nada que avisara que esa persona no existe.
//
//   · Un RUC de persona natural -- la cédula con 001 al final -- se
//     mandaba tal cual, trece dígitos, y no encontraba a nadie. Y sin
//     embargo la persona SÍ está: es la misma, con tres dígitos de más.
//
//   · Un RUC de empresa o un pasaporte tampoco encuentran nada, pero
//     por una razón distinta: no son personas naturales y hoy no se
//     consultan. Merecen otra respuesta.
//
// Este archivo decide cuál de esos casos es, ANTES de gastar una
// consulta, y devuelve qué hacer y qué decirle a quien lo escribió.
//
// SE IMPORTA DESDE LOS DOS LADOS. La aplicación lo usa para avisar
// mientras se escribe; las funciones lo usan porque la validación de
// verdad es la del servidor -- nadie puede confiar en que el pedido
// llegó por la pantalla. Es un archivo de TypeScript sin nada de Deno
// adentro justamente para poder vivir en los dos mundos sin copiarse,
// que es como aparecen las diferencias silenciosas.

export type TipoIdentificacion =
  | "cedula"
  | "ruc_persona_natural"
  | "ruc_sociedad"
  | "ruc_publico"
  | "pasaporte"
  | "cedula_invalida"
  | "vacio";

export interface Identificacion {
  tipo: TipoIdentificacion;
  /** Lo que escribió la persona, sin espacios ni guiones. */
  ingresado: string;
  /** Con qué consultar. null cuando no se puede consultar. */
  cedula: string | null;
  /** Si se puede seguir adelante. */
  consultable: boolean;
  /** Qué decirle a quien lo escribió. Siempre en su idioma. */
  mensaje: string;
  /** Aviso a mostrar junto al resultado cuando se consultó algo distinto
   *  de lo que se escribió. Sin esto, alguien podría creer que está
   *  viendo el RUC y está viendo a la persona. */
  aviso?: string;
}

/**
 * Dígito verificador de una cédula ecuatoriana.
 *
 * Los nueve primeros dígitos se multiplican alternando 2 y 1; a los
 * productos de dos cifras se les resta 9, se suman todos, y el
 * verificador es lo que falta para la siguiente decena.
 *
 * Sirve para lo que sirve un verificador: detectar un dígito cambiado o
 * dos transpuestos, que es el 99% de los errores de tipeo. No dice que
 * la persona exista -- eso solo lo sabe la fuente.
 */
export function cedulaBienFormada(valor: string): boolean {
  if (!/^\d{10}$/.test(valor)) return false;

  // Los dos primeros son la provincia de emisión: 01 a 24, más 30 para
  // quienes nacieron en el exterior.
  const provincia = Number(valor.slice(0, 2));
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30)) return false;

  // NO se valida el tercer dígito. La regla que se repite en todos
  // lados -- "de 0 a 5 es persona natural, 6 y 9 son RUC" -- no
  // resiste los datos: en la cartera consultada hay 30 cédulas con
  // tercer dígito 6, y las 13 que ya se consultaron devolvieron
  // personas reales con perfil completo. Aplicar esa regla habría
  // bloqueado a 30 personas por una creencia.
  //
  // El dígito verificador alcanza: es lo que de verdad distingue un
  // número bien tipeado de uno mal tipeado.
  let suma = 0;
  for (let i = 0; i < 9; i++) {
    const producto = Number(valor[i]) * (i % 2 === 0 ? 2 : 1);
    suma += producto > 9 ? producto - 9 : producto;
  }
  const verificador = (10 - (suma % 10)) % 10;
  return verificador === Number(valor[9]);
}

const SOLO_NUMEROS = /^\d+$/;

export function clasificarIdentificacion(valorCrudo: string | null | undefined): Identificacion {
  const ingresado = String(valorCrudo ?? "").trim().replace(/[\s.-]/g, "");

  if (!ingresado) {
    return { tipo: "vacio", ingresado, cedula: null, consultable: false, mensaje: "Escribí una cédula de 10 dígitos." };
  }

  if (!SOLO_NUMEROS.test(ingresado)) {
    return {
      tipo: "pasaporte",
      ingresado,
      cedula: null,
      consultable: false,
      mensaje:
        "Eso parece un pasaporte. Por ahora solo se consultan cédulas ecuatorianas: las fuentes de datos se buscan por cédula y un pasaporte no las alcanza.",
    };
  }

  if (ingresado.length === 13) {
    const base = ingresado.slice(0, 10);
    const establecimiento = ingresado.slice(10);
    const tercerDigito = Number(ingresado[2]);

    // El orden importa, y no es el obvio.
    //
    // Lo intuitivo sería mirar el tercer dígito primero: 9 es empresa,
    // 6 es sector público. Pero hay personas con cédula de tercer
    // dígito 6, y su RUC empieza igual que el de un municipio. Mirar
    // ese dígito primero las mandaría a todas al mensaje equivocado.
    //
    // Lo que sí los separa sin ambigüedad: el RUC de una persona
    // natural lleva adentro una cédula completa y bien formada, con su
    // dígito verificador. El de una entidad, no. Así que se prueba
    // primero la interpretación de persona, y solo si falla se mira de
    // qué clase de entidad se trata.
    if (cedulaBienFormada(base)) {
      return {
        tipo: "ruc_persona_natural",
        ingresado,
        cedula: base,
        consultable: true,
        mensaje: `Es el RUC de una persona natural. Se consulta a la persona: ${base}.`,
        aviso: `Ingresaste el RUC ${ingresado}. Lo que ves es la persona natural detrás de ese RUC, cédula ${base} — no la actividad del establecimiento ${establecimiento}.`,
      };
    }

    if (tercerDigito === 9) {
      return {
        tipo: "ruc_sociedad",
        ingresado,
        cedula: null,
        consultable: false,
        mensaje:
          "Ese es el RUC de una empresa. Por ahora solo se consultan personas naturales; si querés evaluar al dueño o al representante, buscalo por su cédula.",
      };
    }

    if (tercerDigito === 6) {
      return {
        tipo: "ruc_publico",
        ingresado,
        cedula: null,
        consultable: false,
        mensaje: "Ese es el RUC de una entidad del sector público, no de una persona. Por ahora solo se consultan personas naturales.",
      };
    }

    return {
      tipo: "cedula_invalida",
      ingresado,
      cedula: null,
      consultable: false,
      mensaje: "Son 13 dígitos, pero los 10 primeros no forman una cédula válida. Revisá el número.",
    };
  }

  if (ingresado.length !== 10) {
    return {
      tipo: "pasaporte",
      ingresado,
      cedula: null,
      consultable: false,
      mensaje: `Una cédula tiene 10 dígitos y escribiste ${ingresado.length}. Si es un pasaporte, por ahora no se consulta.`,
    };
  }

  if (!cedulaBienFormada(ingresado)) {
    const provincia = Number(ingresado.slice(0, 2));
    if (!((provincia >= 1 && provincia <= 24) || provincia === 30)) {
      return {
        tipo: "cedula_invalida",
        ingresado,
        cedula: null,
        consultable: false,
        mensaje: `Los dos primeros dígitos (${ingresado.slice(0, 2)}) no corresponden a ninguna provincia. Revisá el número.`,
      };
    }
    if (Number(ingresado[2]) === 9) {
      return {
        tipo: "cedula_invalida",
        ingresado,
        cedula: null,
        consultable: false,
        mensaje: "Ese número arranca como el RUC de una empresa, pero le faltan los 3 dígitos del establecimiento.",
      };
    }
    return {
      tipo: "cedula_invalida",
      ingresado,
      cedula: null,
      consultable: false,
      mensaje: "Esa cédula no es válida: el último dígito no verifica. Suele ser un número cambiado o dos invertidos.",
    };
  }

  return { tipo: "cedula", ingresado, cedula: ingresado, consultable: true, mensaje: "" };
}
