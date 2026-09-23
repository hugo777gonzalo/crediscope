// Los nombres de los grupos del Perfil del Cliente, en un solo lugar.
//
// Estaban escritos adentro de SegmentosPerfil.jsx, que es una pantalla.
// Las tres pantallas de configuración necesitan los mismos nombres, y
// copiarlos habría hecho que renombrar un grupo lo cambiara en un lado
// y no en el otro -- exactamente la clase de diferencia silenciosa que
// nadie descubre hasta que alguien pregunta por qué la misma cosa se
// llama distinto en dos pantallas.
//
// Son solo texto de presentación: las claves que manda la fuente y los
// nombres internos no cambian.
export const ETIQUETAS_GRUPO = {
  cumplimiento: "Cumplimiento y Listas de Control",
  riesgoSeguridadCiudadana: "Riesgo de Seguridad Ciudadana",
  comportamientoBancario: "Comportamiento Bancos / BIESS / Diners",
  comportamientoCooperativas: "Comportamiento Cooperativas",
  riesgoJudicialCrediticio: "Riesgo Judicial Crediticio",
  riesgoJudicialCivil: "Riesgo Judicial / Civil (otros)",
  riesgoPenal: "Riesgo Penal / Fiscalía",
  laboral: "Situación Laboral e Ingresos",
  tributario: "Situación Tributaria (SRI)",
  seguridadSocial: "Seguridad Social",
  patrimonio: "Patrimonio",
  familia: "Núcleo Familiar",
  identidad: "SocioDemográficas",
  contacto: "Contacto y Domicilio",
  transitoVehicular: "Tránsito Vehicular",
  comportamientoInterno: "Comportamiento Interno (Fuente Externa)",
  fuentesIngreso: "Fuentes de Ingreso",
  // No es información del cliente: es el registro de qué fuentes
  // trajeron datos, cuáles contestaron que no hay nada y cuáles no se
  // pudieron medir. Sirve para auditar la consulta, no para evaluar a
  // la persona -- por eso viene oculto de fábrica.
  metaConsulta: "Estado de la consulta (técnico)",
};
