// Militares y policías no aportan al IESS: tienen su propio seguro social,
// el ISSFAC y el ISSPOL. Sin leerlos, un militar en servicio activo o
// retirado quedaba "Informal o sin actividad": c-cc538abe (Militar en
// Servicio Pasivo, 70 años, con pensión de retiro) salió así en la
// validación de marco-v24. Medido el 2026-09-28 en la cartera real: 34
// militares (10 en servicio activo, 24 en servicio pasivo), 2 con montepío
// y 9 policías (6 en servicio activo, 3 retirados).
//
// Las fuentes listan también a los FAMILIARES que el seguro cubre ("Esposa
// de Militar en Servicio Activo", "Hijo de Militar...", "Dependiente
// P.Activo"). Esos no son militares ni policías: hasta estructura-v8
// contaban como "afiliado al seguro militar" (10 personas). Y un registro
// que trae la cédula de otra persona no es de esta (la misma regla que las
// denuncias, decisión del negocio del 2026-09-28).
//
// La usan el perfil (seguridadSocial) y la clasificación de ingresos
// (fuentes-ingreso.ts): una sola lectura.

type AnyRecord = Record<string, unknown>;

export type SituacionMilitarPolicial = "activo" | "pasivo" | "montepio";

export interface ServicioMilitarPolicial {
  institucion: "ISSFAC" | "ISSPOL";
  situacion: SituacionMilitarPolicial;
}

function lista(raw: AnyRecord, fuente: string, campo: string): AnyRecord[] {
  const items = ((raw?.[fuente] as AnyRecord | undefined)?.data as AnyRecord | undefined)?.[campo];
  return Array.isArray(items) ? (items as AnyRecord[]) : [];
}

function normalizar(v: unknown): string {
  return String(v ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

const PRIORIDAD: SituacionMilitarPolicial[] = ["activo", "pasivo", "montepio"];

// Lo que se leyó de cada registro, con su posición en el crudo: la capa de hechos
// (hechos/grupos/seguridad-social.ts) cita el que decide y descarta los demás con
// su motivo. `servicio` es null si el registro no dice que la persona sea militar
// o policía (un familiar cubierto, un certificado sin servicio) o si es de otra
// persona (`deOtraPersona`). Un certificado del SIISSPOL con varias afiliaciones
// que cuentan da una lectura por cada una, con la misma posición.
export interface LecturaMilitarPolicial {
  fuente: "afiliacionIssfacCertMedico" | "afiliacionIssfacFuerzaArmada" | "afiliacionSiisspol";
  lista: "afiliaciones" | "afiliacionSiisspol";
  indice: number;
  servicio: ServicioMilitarPolicial | null;
  deOtraPersona: boolean;
}

export function lecturasMilitaresOPoliciales(raw: unknown, cedula: string | null | undefined): LecturaMilitarPolicial[] {
  const r = (raw ?? {}) as AnyRecord;
  const esDeOtraPersona = (c: unknown) => Boolean(cedula && c && String(c) !== cedula);
  const lecturas: LecturaMilitarPolicial[] = [];

  // ISSFAC: la categoría dice quién es ("Militar en Servicio Activo",
  // "Militar en Servicio Pasivo", "Montepío", "Esposa de...").
  for (const fuente of ["afiliacionIssfacCertMedico", "afiliacionIssfacFuerzaArmada"] as const) {
    lista(r, fuente, "afiliaciones").forEach((a, indice) => {
      const leida = (servicio: ServicioMilitarPolicial | null, deOtraPersona = false) => lecturas.push({ fuente, lista: "afiliaciones", indice, servicio, deOtraPersona });
      if (esDeOtraPersona(a.cedula)) return void leida(null, true);
      const categoria = normalizar(a.categoria);
      if (categoria.startsWith("MILITAR EN SERVICIO ACTIVO")) leida({ institucion: "ISSFAC", situacion: "activo" });
      else if (categoria.startsWith("MILITAR EN SERVICIO PASIVO")) leida({ institucion: "ISSFAC", situacion: "pasivo" });
      else if (categoria.startsWith("MONTEPIO")) leida({ institucion: "ISSFAC", situacion: "montepio" });
      else leida(null);
    });
  }

  // ISSPOL: el certificado del SIISSPOL dice el servicio (ACTIVO o RETIRO).
  // Los registros sin servicio (cesantes, dependientes, certificados de
  // otro tipo) no alcanzan para decir que la persona es policía.
  lista(r, "afiliacionSiisspol", "afiliacionSiisspol").forEach((certificado, indice) => {
    const leida = (servicio: ServicioMilitarPolicial | null, deOtraPersona = false) => lecturas.push({ fuente: "afiliacionSiisspol", lista: "afiliacionSiisspol", indice, servicio, deOtraPersona });
    if (esDeOtraPersona(certificado.cedula)) return void leida(null, true);
    const afiliaciones = Array.isArray(certificado.afiliaciones) ? (certificado.afiliaciones as AnyRecord[]) : [];
    let cuenta = 0;
    for (const a of afiliaciones) {
      const servicio = normalizar(a.servicio);
      if (servicio === "ACTIVO") leida({ institucion: "ISSPOL", situacion: "activo" });
      else if (servicio === "RETIRO") leida({ institucion: "ISSPOL", situacion: "pasivo" });
      else continue;
      cuenta++;
    }
    if (cuenta === 0) leida(null);
  });
  return lecturas;
}

// La lectura que decide: si hay más de una, pesa el servicio activo (es un
// sueldo, y el retiro o el montepío pasan a ser un ingreso adicional); a igual
// situación, la primera en el orden de lectura (ISSFAC antes que ISSPOL). null
// si ninguna dice que la persona sea militar o policía.
export function lecturaQueDecide(lecturas: LecturaMilitarPolicial[]): LecturaMilitarPolicial | null {
  let ganadora: LecturaMilitarPolicial | null = null;
  for (const l of lecturas) {
    if (!l.servicio) continue;
    if (!ganadora || PRIORIDAD.indexOf(l.servicio.situacion) < PRIORIDAD.indexOf(ganadora.servicio!.situacion)) ganadora = l;
  }
  return ganadora;
}

export function servicioMilitarOPolicial(raw: unknown, cedula: string | null | undefined): ServicioMilitarPolicial | null {
  return lecturaQueDecide(lecturasMilitaresOPoliciales(raw, cedula))?.servicio ?? null;
}

// seguridadSocial.servicioMilitarOPolicial: en palabras, porque lo lee el
// modelo tal cual. Vivía en process.ts; desde que la capa de hechos arma el
// mismo campo (hechos/grupos/seguridad-social.ts) vive acá, una sola vez.
const DESCRIPCION_SERVICIO: Record<string, string> = {
  "ISSFAC:activo": "militar en servicio activo",
  "ISSFAC:pasivo": "militar en servicio pasivo (retirado)",
  "ISSFAC:montepio": "beneficiario de montepío militar",
  "ISSPOL:activo": "policía en servicio activo",
  "ISSPOL:pasivo": "policía en servicio pasivo (retirado)",
  "ISSPOL:montepio": "beneficiario de montepío policial",
};

export function descripcionDelServicio(servicio: ServicioMilitarPolicial | null): string | null {
  return servicio ? DESCRIPCION_SERVICIO[`${servicio.institucion}:${servicio.situacion}`] ?? null : null;
}
