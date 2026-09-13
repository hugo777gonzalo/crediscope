// Curación de qué campos del StandardClientProfile se muestran en la
// página "Perfil del Cliente" y cómo — a pedido del usuario, la vista
// debe ser puramente informativa (sin positivo/negativo, eso es
// trabajo del Análisis con IA) y solo mostrar lo que tiene dato real,
// no los ~150 campos crudos. `presencia` decide si el segmento tiene
// algo relevante que mostrar (usado por el modo "con_datos" de
// standard_profile_segment_config); `campos` es la lista curada — no
// todos los campos del grupo, solo los que aportan valor de lectura
// rápida a un analista.

function get(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

const MONEDA = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

// Novadata devuelve varios campos de texto en MAYÚSCULAS_CON_GUION_BAJO
// (nivelEducacion, estadoCivil, genero, tipos de demanda, etc.) — se
// normalizan a formato de lectura sin perder la palabra completa.
function humanizarTexto(texto) {
  if (texto !== texto.toUpperCase()) return texto; // ya viene con formato propio (ej. nombres propios)
  const normal = texto.replace(/_/g, " ").toLowerCase();
  return normal.charAt(0).toUpperCase() + normal.slice(1);
}

// meses -> "X años Y meses" / "X años" / "Y meses" — más legible que un
// número crudo de meses para antigüedad laboral/de actividad económica.
function formatMeses(totalMeses) {
  const anios = Math.floor(totalMeses / 12);
  const meses = totalMeses % 12;
  if (anios === 0) return `${meses} mes${meses === 1 ? "" : "es"}`;
  if (meses === 0) return `${anios} año${anios === 1 ? "" : "s"}`;
  return `${anios} año${anios === 1 ? "" : "s"} ${meses} mes${meses === 1 ? "" : "es"}`;
}

const ETIQUETAS_ESTADO_ACTIVIDAD = {
  sin_ruc: "Sin RUC",
  activa_sin_interrupciones: "Activa (sin interrupciones)",
  activa_reactivada: "Activa (reactivada)",
  inactiva_nunca_reactivada: "Inactiva (nunca reactivada)",
  inactiva_tras_reactivacion: "Inactiva (tras una reactivación)",
};

const ETIQUETAS_TIPO_CESE_RUC = {
  cancelacion: "Cancelación",
  suspension_definitiva: "Suspensión definitiva",
};

export function formatValor(valor, tipo) {
  switch (tipo) {
    case "moneda":
      return MONEDA.format(valor);
    case "lista":
      return valor.map(humanizarTexto).join(", ");
    case "booleano_si_true":
      return "Sí";
    case "texto":
      return humanizarTexto(String(valor));
    case "meses":
      return formatMeses(valor);
    case "estado_actividad":
      return ETIQUETAS_ESTADO_ACTIVIDAD[valor] ?? valor;
    case "tipo_cese_ruc":
      return ETIQUETAS_TIPO_CESE_RUC[valor] ?? valor;
    default:
      return String(valor);
  }
}

// null = el campo no aporta nada visible en su estado actual (se omite la fila).
export function valorVisible(profile, campo, tipo) {
  const valor = get(profile, campo);
  if (valor === null || valor === undefined) return null;
  if (tipo === "booleano_si_true") return valor === true ? true : null;
  if (tipo === "lista") return Array.isArray(valor) && valor.length > 0 ? valor : null;
  if ((tipo === "numero" || tipo === "moneda" || tipo === "meses") && valor === 0) return null;
  if (tipo === "texto" && valor === "") return null;
  return valor;
}

export const GRUPOS_CONFIG = {
  identidad: {
    mensajeVacio: "Sin datos socio-demográficos registrados.",
    presencia: (p) => Boolean(p.identidad?.nombreCompleto),
    campos: [
      ["edad", "Edad", "numero"],
      ["genero", "Género", "texto"],
      ["estadoCivil", "Estado civil", "texto"],
      ["nivelEducacion", "Nivel de educación", "texto"],
      ["profesiones", "Profesión", "lista"],
      ["cantonNacimiento", "Cantón de nacimiento", "texto"],
      ["provinciaNacimiento", "Provincia de nacimiento", "texto"],
      ["esExtranjero", "Extranjero", "booleano_si_true"],
    ],
  },
  contacto: {
    mensajeVacio: "Sin direcciones, teléfonos ni correos registrados.",
    presencia: (p) => (p.contacto?.numeroDirecciones ?? 0) > 0 || (p.contacto?.numeroTelefonos ?? 0) > 0 || (p.contacto?.numeroCorreos ?? 0) > 0,
    campos: [
      ["numeroDirecciones", "Direcciones registradas", "numero"],
      ["numeroTelefonos", "Teléfonos registrados", "numero"],
      ["numeroCorreos", "Correos registrados", "numero"],
      ["direccionActualizada12M", "Dirección actualizada (12m)", "booleano_si_true"],
      ["telefonoActualizado12M", "Teléfono actualizado (12m)", "booleano_si_true"],
      ["correoActualizado12M", "Correo actualizado (12m)", "booleano_si_true"],
    ],
  },
  familia: {
    mensajeVacio: "Sin hijos registrados.",
    presencia: (p) => p.familia?.tieneHijos || (p.familia?.numeroHijos ?? 0) > 0,
    campos: [
      ["numeroHijos", "Número de hijos", "numero"],
      ["tieneHijoMenorEdad", "Tiene hijo/s menor/es de edad", "booleano_si_true"],
      ["padresFallecidos", "Padres fallecidos", "numero"],
    ],
  },
  laboral: {
    mensajeVacio: "Sin empleo, RUC ni establecimiento activo registrados.",
    presencia: (p) => Boolean(p.laboral?.empleoActual) || p.laboral?.tieneRucActivo || p.laboral?.tieneEstablecimientoActivo,
    campos: [
      ["empleoActual.empleador", "Empleador", "texto"],
      ["empleoActual.cargo", "Cargo", "texto"],
      ["empleoActual.salarioAprox", "Salario aproximado", "moneda"],
      ["ingresoPromedioUltimos6Meses", "Ingreso promedio (6m)", "moneda"],
      ["numeroEmpleadoresUltimos24Meses", "Empleadores activos (24m)", "numero"],
      ["antiguedadEmpleoActualMeses", "Antigüedad en el empleo actual", "meses"],
      ["duracionEmpleoMasLargoMeses", "Empleo más largo registrado", "meses"],
      ["tieneRucActivo", "RUC activo", "booleano_si_true"],
      ["tieneEstablecimientoActivo", "Establecimiento activo", "booleano_si_true"],
      ["estadoActividadEconomica", "Estado de la actividad económica", "estado_actividad"],
      ["antiguedadUltimaEtapaActivaMeses", "Antigüedad de la actividad económica", "meses"],
      ["mesesInactivoActividadEconomica", "Tiempo inactiva", "meses"],
      ["tipoUltimoCeseRuc", "Tipo de cese más reciente (RUC)", "tipo_cese_ruc"],
      ["esIndependiente", "Independiente", "booleano_si_true"],
      ["numeroEmpleadosRegistrados", "Empleados registrados", "numero"],
    ],
  },
  tributario: {
    mensajeVacio: "Sin registros tributarios (SRI).",
    presencia: (p) => p.tributario?.esAfiliadoUnipersonal || p.tributario?.generaImpuestoRenta || p.tributario?.pagaISD,
    campos: [
      ["esAfiliadoUnipersonal", "Afiliado unipersonal", "booleano_si_true"],
      ["generaImpuestoRenta", "Genera impuesto a la renta", "booleano_si_true"],
      ["montoMaximoImpuestoRenta", "Monto máximo impuesto renta", "moneda"],
      ["pagaISD", "Paga ISD", "booleano_si_true"],
      ["montoMaximoISD", "Monto máximo ISD", "moneda"],
    ],
  },
  seguridadSocial: {
    mensajeVacio: "Sin afiliación IESS activa ni condición de pensionista/jubilado.",
    presencia: (p) => p.seguridadSocial?.afiliadoIessActivo || p.seguridadSocial?.esPensionista || p.seguridadSocial?.esJubilado,
    campos: [
      ["afiliadoIessActivo", "Afiliado IESS activo", "booleano_si_true"],
      ["esPensionista", "Pensionista", "booleano_si_true"],
      ["esJubilado", "Jubilado", "booleano_si_true"],
      ["estadoAfiliacionIess", "Estado afiliación IESS", "texto"],
    ],
  },
  patrimonio: {
    mensajeVacio: "Sin vehículos, inmuebles ni inversiones registrados.",
    presencia: (p) => p.patrimonio?.tieneVehiculos || (p.patrimonio?.numeroInmuebles ?? 0) > 0 || (p.patrimonio?.numeroInversiones ?? 0) > 0,
    campos: [
      ["numeroVehiculos", "Vehículos", "numero"],
      ["valorColateralVehiculos", "Valor colateral vehículos", "moneda"],
      ["numeroInmuebles", "Inmuebles", "numero"],
      ["numeroInversiones", "Inversiones", "numero"],
    ],
  },
  comportamientoBancario: {
    mensajeVacio: "Sin operaciones registradas en el buró de crédito.",
    presencia: (p) => (p.comportamientoBancario?.numeroOperacionesBuroCredito ?? 0) > 0 || p.comportamientoBancario?.tieneCreditoIessBiess || (p.comportamientoBancario?.numeroDeudasRetail ?? 0) > 0,
    campos: [
      ["numeroOperacionesBuroCredito", "Operaciones en buró de crédito", "numero"],
      ["peorCalificacionRiesgo", "Peor calificación", "texto"],
      ["mejorCalificacionRiesgo", "Mejor calificación", "texto"],
      ["saldoTotalVigente", "Saldo total vigente", "moneda"],
      ["saldoEnMoraBuroCredito", "Saldo en mora", "moneda"],
      ["tieneOperacionConDemanda", "Con demanda", "booleano_si_true"],
      ["tieneOperacionCastigada", "Cartera castigada", "booleano_si_true"],
      ["numeroDeudasRetail", "Deudas retail", "numero"],
      ["totalDeudaRetail", "Total deuda retail", "moneda"],
      ["tieneCreditoIessBiess", "Crédito IESS/BIESS", "booleano_si_true"],
    ],
  },
  comportamientoCooperativas: {
    mensajeVacio: "Sin operaciones registradas en cooperativas.",
    presencia: (p) => (p.comportamientoCooperativas?.numeroOperaciones ?? 0) > 0,
    campos: [
      ["numeroOperaciones", "Operaciones", "numero"],
      ["saldoTotal", "Saldo total", "moneda"],
      ["saldoEnMora", "Saldo en mora", "moneda"],
      ["tieneOperacionConDemanda", "Con demanda", "booleano_si_true"],
      ["tieneOperacionCastigada", "Cartera castigada", "booleano_si_true"],
    ],
  },
  riesgoJudicialCrediticio: {
    mensajeVacio: "Sin demandas de naturaleza crediticia registradas.",
    presencia: (p) => (p.riesgoJudicialCrediticio?.numeroDemandasComoDemandado ?? 0) > 0,
    campos: [
      ["numeroDemandasComoDemandado", "Demandas como demandado", "numero"],
      ["tiposDemandasComoDemandado", "Tipos", "lista"],
    ],
  },
  riesgoJudicialCivil: {
    mensajeVacio: "Sin demandas civiles ni pensión alimenticia registradas.",
    presencia: (p) =>
      (p.riesgoJudicialCivil?.numeroDemandasComoDemandado ?? 0) > 0 ||
      (p.riesgoJudicialCivil?.numeroDemandasComoOfendido ?? 0) > 0 ||
      (p.riesgoJudicialCivil?.deudaPensionAlimenticia ?? 0) > 0,
    campos: [
      ["numeroDemandasComoDemandado", "Demandas como demandado", "numero"],
      ["tiposDemandasComoDemandado", "Tipos", "lista"],
      ["numeroDemandasComoOfendido", "Demandas como ofendido", "numero"],
      ["pensionAlimenticiaEnMora", "Pensión alimenticia en mora", "booleano_si_true"],
      ["deudaPensionAlimenticia", "Deuda pensión alimenticia", "moneda"],
    ],
  },
  riesgoPenal: {
    mensajeVacio: "Sin antecedentes penales ni denuncias registradas.",
    presencia: (p) => p.riesgoPenal?.tieneAntecedentesPenales || (p.riesgoPenal?.numeroDenunciasComoSospechoso ?? 0) > 0 || (p.riesgoPenal?.numeroDenunciasComoVictima ?? 0) > 0,
    campos: [
      ["tieneAntecedentesPenales", "Antecedentes penales", "booleano_si_true"],
      ["descripcionAntecedentes", "Descripción", "texto"],
      ["numeroDenunciasComoSospechoso", "Denuncias como sospechoso", "numero"],
      ["numeroDenunciasComoVictima", "Denuncias como víctima", "numero"],
    ],
  },
  cumplimiento: {
    mensajeVacio: "Sin coincidencias en listas de control ni impedimentos registrados.",
    presencia: (p) =>
      p.cumplimiento?.enListaControl ||
      p.cumplimiento?.enListaNegra ||
      p.cumplimiento?.impedimentoCargosPublicos ||
      p.cumplimiento?.registraSercopContraloria ||
      p.cumplimiento?.esPersonaExpuestaPoliticamente ||
      p.cumplimiento?.tieneHomonimoEnListaControl,
    campos: [
      ["enListaControl", "En lista de control", "booleano_si_true"],
      ["tieneHomonimoEnListaControl", "Homónimo en lista de control", "booleano_si_true"],
      ["enListaNegra", "En lista negra", "booleano_si_true"],
      ["impedimentoCargosPublicos", "Impedimento cargos públicos", "booleano_si_true"],
      ["causalImpedimento", "Causal", "texto"],
      ["registraSercopContraloria", "Registra SERCOP/Contraloría", "booleano_si_true"],
      ["esPersonaExpuestaPoliticamente", "Persona expuesta políticamente", "booleano_si_true"],
      ["detallePep.cargo", "Cargo PEP", "texto"],
      ["detallePep.empresa", "Entidad PEP", "texto"],
    ],
  },
  riesgoSeguridadCiudadana: {
    mensajeVacio: "Sin coincidencias en delitos de seguridad ciudadana.",
    presencia: (p) => Boolean(p.riesgoSeguridadCiudadana?.tieneDelitoSeguridadCiudadana),
    campos: [["categoriasDelitoSeguridadCiudadana", "Categorías", "lista"]],
  },
  transitoVehicular: {
    mensajeVacio: "Sin licencia ni multas de tránsito registradas.",
    presencia: (p) => p.transitoVehicular?.tieneLicenciaVigente || (p.transitoVehicular?.numeroMultas ?? 0) > 0,
    campos: [
      ["tieneLicenciaVigente", "Licencia vigente", "booleano_si_true"],
      ["puntosLicencia", "Puntos de licencia", "numero"],
      ["numeroMultas", "Multas", "numero"],
      ["valorAdeudadoTransito", "Valor adeudado", "moneda"],
    ],
  },
  comportamientoInterno: {
    mensajeVacio: "No es cliente interno de Novadata.",
    presencia: (p) => Boolean(p.comportamientoInterno?.esClienteInterno),
    campos: [
      ["novadataResultadoHabitoPago", "Hábito de pago (Novadata)", "texto"],
      ["novadataPerfilInterno", "Perfil interno (Novadata)", "texto"],
      ["novadataDiasMoraMaxima", "Días mora máxima", "numero"],
      ["novadataDiasMoraVigente", "Días mora vigente", "numero"],
      ["novadataSaldoCapitalVigente", "Saldo capital vigente", "moneda"],
    ],
  },
};

// Novadata devuelve nombreCompleto como "APELLIDO1 APELLIDO2 NOMBRE1
// NOMBRE2" (convención de registro civil ecuatoriano). Para un header
// premium mostramos solo "Nombre1 Apellido1" — heurística de 4 tokens;
// si no calza (compuestos, un solo nombre, etc.) se muestra el nombre
// completo humanizado entero, más seguro que adivinar mal el orden.
export function nombreCorto(nombreCompleto) {
  if (!nombreCompleto) return null;
  const partes = nombreCompleto.trim().split(/\s+/);
  const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (partes.length === 4) {
    const [apellido1, , nombre1] = partes;
    return `${capitalizar(nombre1)} ${capitalizar(apellido1)}`;
  }
  return partes.map(capitalizar).join(" ");
}

export function filasVisibles(profile, grupo) {
  const config = GRUPOS_CONFIG[grupo];
  if (!config) return [];
  return config.campos
    .map(([campo, etiqueta, tipo]) => {
      const valor = valorVisible(profile[grupo] ?? {}, campo, tipo);
      if (valor === null) return null;
      return { etiqueta, texto: formatValor(valor, tipo) };
    })
    .filter(Boolean);
}
