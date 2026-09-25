// Perfil laboral: qué tipo de trabajador es la persona, mirando dos
// preguntas por separado.
//
//   ¿Trabaja para un tercero?   (dependencia) -- un aporte al IESS de un
//                               empleador público, privado, doméstico,
//                               diplomático o agrícola. Es lo único que
//                               trae monto, y lo declara ese tercero.
//   ¿Tiene actividad propia?    (independencia) -- RUC activo en el SRI, o
//                               ser empleador (paga nómina). No trae monto:
//                               se sabe que existe y desde cuándo, no
//                               cuánto deja.
//
// POR QUÉ DOS PREGUNTAS Y NO MÁS SEGMENTOS
//
// Medido el 2026-09-25 sobre el último perfil de 2.585 clientes con datos:
// 675 (26%) trabajan en relación de dependencia Y tienen un RUC activo --
// más de la mitad de los dependientes, con ~10 años de RUC en promedio. El
// segmento de fuentes-ingreso.ts los mostraba como "dependiente privado"
// (465) o "sector público" (143): responde de qué fuente depende el
// ingreso que se puede MEDIR, y sólo la dependencia trae monto. Eso sigue
// siendo cierto; lo que faltaba era decir que además tienen un negocio.
// El perfil laboral no reemplaza al segmento: lo acompaña.
//
// Se calcula desde el perfil estandarizado guardado, no desde el crudo, así
// que vale igual para un perfil de hace un mes que para uno nuevo. NO va al
// modelo: no se guarda dentro del perfil, sólo en la columna
// client_profiles.perfil_laboral (para contar en el panorama) y se
// recalcula en la pantalla. Meterlo al análisis con IA es otra decisión,
// con su versión de marco.
//
// En el negocio se dice "dependiente", no "asalariado" (pedido del
// 2026-09-25).

export const PERFIL_LABORAL_VERSION = "perfil-laboral-v1";

export type ClavePerfilLaboral =
  | "dependiente"
  | "dependiente_con_actividad_propia"
  | "independiente"
  | "independiente_con_empleados"
  | "afiliado_voluntario"
  | "jubilado"
  | "sin_actividad_registrada"
  | "sin_datos";

export const ETIQUETA_PERFIL_LABORAL: Record<ClavePerfilLaboral, string> = {
  dependiente: "Dependiente",
  dependiente_con_actividad_propia: "Dependiente con actividad propia",
  independiente: "Independiente",
  independiente_con_empleados: "Independiente con empleados",
  afiliado_voluntario: "Afiliado voluntario sin actividad registrada",
  jubilado: "Jubilado",
  sin_actividad_registrada: "Sin actividad registrada",
  sin_datos: "Sin datos: la fuente no respondió",
};

export interface PerfilLaboral {
  version: string;
  clave: ClavePerfilLaboral;
  etiqueta: string;
  dependencia: boolean;
  actividadPropia: boolean;
  empleador: boolean; // paga nómina o tiene empleados registrados
  jubilacion: boolean;
  // Aporta por su cuenta sin RUC activo: puede ser sólo para no perder la
  // seguridad social. No prueba trabajo (misma regla que la continuidad).
  aporteVoluntarioSinRuc: boolean;
  // Sólo con dependencia: el empleador es un familiar (comparte apellido)
  // o la propia persona. Formalmente es un empleo; en la práctica puede ser
  // su negocio.
  vinculoConEmpleador: "empleador_con_su_apellido" | "es_su_propio_empleador" | null;
  // Los que trabajan para un tercero, con su naturaleza y lo reportado.
  empleos: { empleador: string | null; naturaleza: string; monto: number | null }[];
  ingresoDependencia: number | null; // suma de lo reportado por los empleos
  rucActivoDesde: string | null; // yyyy-mm-dd, inicio de la etapa activa actual del RUC
  actividades: string[]; // actividad económica de los establecimientos abiertos (desde fuentes-v4)
  nomina: number | null; // nómina mensual que paga
  // Paga una nómina mayor que lo que le reportan como dependiente: su
  // actividad propia es, probablemente, la principal (misma regla que el
  // segmento en fuentes-ingreso.ts).
  actividadPropiaPrincipal: boolean;
}

type AnyRecord = Record<string, unknown>;

const NATURALEZAS_DEPENDENCIA = new Set(["publico", "privado", "domestico", "diplomatico", "agricola", "otro"]);

export function clasificarPerfilLaboral(perfil: AnyRecord | null | undefined): PerfilLaboral | null {
  const f = perfil?.fuentesIngreso as AnyRecord | undefined;
  if (!f) return null;
  const laboral = (perfil?.laboral ?? {}) as AnyRecord;
  const social = (perfil?.seguridadSocial ?? {}) as AnyRecord;
  const fuentes = (Array.isArray(f.fuentes) ? f.fuentes : []) as AnyRecord[];
  const senales = (Array.isArray(f.senalesDeEscala) ? f.senalesDeEscala : []) as AnyRecord[];

  // Aportes al IESS (los únicos con evidencia distinta de "indirecta").
  // "otro" -- un código de empleador que no conocemos -- se cuenta como
  // dependencia: es un aporte hecho por un empleador, aunque no sepamos de
  // qué tipo. El segmento lo marca aparte para revisión manual.
  const empleos = fuentes
    .filter((x) => x.evidencia !== "indirecta" && NATURALEZAS_DEPENDENCIA.has(String(x.naturaleza)))
    .map((x) => ({
      empleador: typeof x.empleador === "string" ? x.empleador : null,
      naturaleza: String(x.naturaleza),
      monto: typeof x.montoMensualReportado === "number" ? x.montoMensualReportado : null,
    }));
  const aportePropio = fuentes.some((x) => x.evidencia !== "indirecta" && x.naturaleza === "cuenta_propia");
  const rucActivo = laboral.tieneRucActivo === true || fuentes.some((x) => x.tipo === "actividad económica propia");
  const nominaSenal = senales.find((s) => s.senal === "nómina que paga")?.valor;
  const nomina = typeof nominaSenal === "number" && nominaSenal > 0 ? nominaSenal : null;
  const empleador = nomina !== null || Number(laboral.numeroEmpleadosRegistrados ?? 0) > 0;
  const jubilacion = fuentes.some((x) => x.tipo === "jubilación") || social.esJubilado === true;

  const dependencia = empleos.length > 0;
  const actividadPropia = rucActivo || empleador;
  const ingresoDependencia = empleos.reduce((a, e) => a + (e.monto ?? 0), 0) || null;

  let clave: ClavePerfilLaboral;
  if (f.segmento === "sin_datos") clave = "sin_datos";
  else if (dependencia && actividadPropia) clave = "dependiente_con_actividad_propia";
  else if (dependencia) clave = "dependiente";
  else if (actividadPropia) clave = empleador ? "independiente_con_empleados" : "independiente";
  else if (aportePropio) clave = "afiliado_voluntario";
  else if (jubilacion) clave = "jubilado";
  else clave = "sin_actividad_registrada";

  // "Es su propio empleador" sale también de una afiliación unipersonal, y
  // eso ya es independencia. Sólo se dice como vínculo de un EMPLEO si la
  // persona no tiene aporte propio que lo explique.
  const vinculoConEmpleador = !dependencia
    ? null
    : laboral.clienteEsSuPropioEmpleador === true && !aportePropio
      ? "es_su_propio_empleador"
      : laboral.empleadorConApellidoDelCliente === true
        ? "empleador_con_su_apellido"
        : null;

  // La etapa activa actual: si el RUC se reactivó, desde el reinicio.
  const rucActivoDesde = rucActivo
    ? ((laboral.estadoActividadEconomica === "activa_reactivada" ? laboral.fechaReinicioActividadesRuc : laboral.fechaInicioActividadesRuc) as
        | string
        | null) ?? null
    : null;

  const actividadesEconomicas = ((f.detalle ?? {}) as AnyRecord).actividadesEconomicas;
  const actividades = (Array.isArray(actividadesEconomicas) ? (actividadesEconomicas as AnyRecord[]) : [])
    .filter((a) => a.abierto === true && typeof a.actividad === "string")
    .map((a) => String(a.actividad));

  return {
    version: PERFIL_LABORAL_VERSION,
    clave,
    etiqueta: ETIQUETA_PERFIL_LABORAL[clave],
    dependencia,
    actividadPropia,
    empleador,
    jubilacion,
    aporteVoluntarioSinRuc: aportePropio && !rucActivo,
    vinculoConEmpleador,
    empleos,
    ingresoDependencia,
    rucActivoDesde,
    actividades: [...new Set(actividades)],
    nomina,
    actividadPropiaPrincipal: dependencia && nomina !== null && nomina > (ingresoDependencia ?? 0),
  };
}
