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

export function servicioMilitarOPolicial(raw: unknown, cedula: string | null | undefined): ServicioMilitarPolicial | null {
  const r = (raw ?? {}) as AnyRecord;
  const esDeOtraPersona = (c: unknown) => Boolean(cedula && c && String(c) !== cedula);
  const encontrados: ServicioMilitarPolicial[] = [];

  // ISSFAC: la categoría dice quién es ("Militar en Servicio Activo",
  // "Militar en Servicio Pasivo", "Montepío", "Esposa de...").
  for (const fuente of ["afiliacionIssfacCertMedico", "afiliacionIssfacFuerzaArmada"]) {
    for (const a of lista(r, fuente, "afiliaciones")) {
      if (esDeOtraPersona(a.cedula)) continue;
      const categoria = normalizar(a.categoria);
      if (categoria.startsWith("MILITAR EN SERVICIO ACTIVO")) encontrados.push({ institucion: "ISSFAC", situacion: "activo" });
      else if (categoria.startsWith("MILITAR EN SERVICIO PASIVO")) encontrados.push({ institucion: "ISSFAC", situacion: "pasivo" });
      else if (categoria.startsWith("MONTEPIO")) encontrados.push({ institucion: "ISSFAC", situacion: "montepio" });
    }
  }

  // ISSPOL: el certificado del SIISSPOL dice el servicio (ACTIVO o RETIRO).
  // Los registros sin servicio (cesantes, dependientes, certificados de
  // otro tipo) no alcanzan para decir que la persona es policía.
  for (const certificado of lista(r, "afiliacionSiisspol", "afiliacionSiisspol")) {
    if (esDeOtraPersona(certificado.cedula)) continue;
    const afiliaciones = Array.isArray(certificado.afiliaciones) ? (certificado.afiliaciones as AnyRecord[]) : [];
    for (const a of afiliaciones) {
      const servicio = normalizar(a.servicio);
      if (servicio === "ACTIVO") encontrados.push({ institucion: "ISSPOL", situacion: "activo" });
      else if (servicio === "RETIRO") encontrados.push({ institucion: "ISSPOL", situacion: "pasivo" });
    }
  }

  // Si hay más de uno, pesa el servicio activo: es un sueldo, y el retiro o
  // el montepío pasan a ser un ingreso adicional.
  encontrados.sort((a, b) => PRIORIDAD.indexOf(a.situacion) - PRIORIDAD.indexOf(b.situacion));
  return encontrados[0] ?? null;
}
