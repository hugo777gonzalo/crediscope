// Un perfil estandarizado INVENTADO, con todos los grupos que lee el perfil
// del modelo y valores falsos. El repositorio es público: las pruebas no
// pueden usar el perfil de nadie.
//
// No es un archivo de pruebas: lo importa perfil-del-modelo-buro.test.ts,
// que compara lo que arma el perfil del modelo de una persona SIN buró contra
// perfil-del-modelo-sin-buro.esperado.json. Ese archivo se generó con el
// código de marco-v30, antes de sumar el buró de la institución: si cambia, el
// modelo lee otra cosa y es una versión nueva del marco.
//
// Trae deuda en bancos, cooperativas y casas comerciales, lo de codeudor o
// garante, préstamos del IESS/BIESS y una fuente que no contestó, para que la
// prueba con buró tenga algo que sacar en cada lugar.

export function perfilDePrueba(): Record<string, unknown> {
  return {
    cedula: "0000000000",
    identidad: {
      nombreCompleto: "ZZPRUEBA ZZINVENTADA ANA",
      edad: 41,
      genero: "MUJER",
      estadoCivil: "CASADO",
      tieneConyuge: true,
      nivelEducacion: "TERCER NIVEL",
      fallecido: false,
    },
    cumplimiento: {
      enListaControl: false,
      enListaNegra: false,
      registraSercopContraloria: false,
      esPersonaExpuestaPoliticamente: false,
      impedimentoCargosPublicos: false,
      tieneHomonimoEnListaControl: false,
    },
    riesgoSeguridadCiudadana: { tieneDelitoSeguridadCiudadana: false, categoriasDelitoSeguridadCiudadana: [] },
    comportamientoBancario: {
      figuraEnRegistroDeudores: false,
      numeroOperacionesBuroCredito: 3,
      peorCalificacionRiesgo: "B1",
      mejorCalificacionRiesgo: "A1",
      tieneOperacionConDemanda: false,
      tieneOperacionCastigada: false,
      saldoTotalVigente: 5200.4,
      saldoEnMoraBuroCredito: 310.25,
      saldoNoDevengaIntereses: 0,
      deudaEnAtraso: 310.25,
      operacionesEnAtrasoSinMonto: 0,
      numeroOperacionesComoGaranteOCodeudor: 1,
      deudaComoGaranteOCodeudor: 900.6,
      peorCalificacionComoGaranteOCodeudor: "A2",
      numeroCreditosFormales: 1,
      numeroDeudasRetail: 2,
      diasMoraMaximaRetail: 12,
      totalDeudaRetail: 640.5,
      valorVencidoRetail: 80.2,
      tieneCreditoIessBiess: true,
      diasMoraCreditoIessBiess: 0,
    },
    comportamientoCooperativas: {
      numeroOperaciones: 1,
      diasMoraMaxima: 0,
      saldoTotal: 2100.9,
      saldoEnMora: 0,
      tieneOperacionConDemanda: false,
      tieneOperacionCastigada: false,
      cuotaMensualTotal: 145.35,
    },
    riesgoJudicialCrediticio: { numeroDemandasComoDemandado: 0, tiposDemandasComoDemandado: [] },
    riesgoJudicialCivil: {
      numeroDemandasComoDemandado: 1,
      tiposDemandasComoDemandado: ["ALIMENTOS"],
      demandasPorCategoria: [{ categoria: "Familia", cantidad: 1, tipos: ["ALIMENTOS"] }],
      numeroDemandasComoOfendido: 0,
      tienePensionAlimenticia: false,
      pensionAlimenticiaEnMora: false,
      deudaPensionAlimenticia: null,
    },
    riesgoPenal: { tieneAntecedentesPenales: false, descripcionAntecedentes: null, numeroDenunciasComoSospechoso: 0, numeroDenunciasComoVictima: 0 },
    laboral: {
      empleosActuales: [{ empleador: "EMPRESA INVENTADA S.A.", cargo: "ANALISTA", salarioAprox: 1200 }],
      ingresoPromedioUltimos6Meses: 1180.5,
      antiguedadEmpleoActualMeses: 50,
      duracionEmpleoMasLargoMeses: 50,
      tieneRucActivo: false,
      empleadorConApellidoDelCliente: false,
      clienteEsSuPropioEmpleador: false,
    },
    tributario: { pagaISD: false, montoMaximoISD: null, generaImpuestoRenta: false, esAfiliadoUnipersonal: false },
    fuentesIngreso: {
      segmento: "dependiente_privado",
      estadoSegmento: "confirmada",
      corteIessUsado: "2026-08",
      pisoIngresoMensualReportado: 1200,
      fuentes: [
        { evidencia: "reportada_por_tercero", naturaleza: "privado", empleador: "EMPRESA INVENTADA S.A.", tipo: "empleo en relación de dependencia", montoMensualReportado: 1200 },
      ],
    },
    seguridadSocial: { afiliadoIessActivo: true, esPensionista: false, esJubilado: false, estadoAfiliacionIess: "ACTIVO" },
    patrimonio: { numeroVehiculos: 1, valorAvaluoVehiculos: 6500.75, numeroInmuebles: 0, numeroInversiones: 0, valorColateralVehiculos: 9100.4 },
    familia: { numeroHijos: 2, tieneHijos: true, tieneHijoMenorEdad: true },
    contacto: { numeroDireccionesUltimos12Meses: 1, numeroTelefonosUltimos12Meses: 1 },
    transitoVehicular: { tieneLicenciaVigente: true, puntosLicencia: 30, numeroMultas: 0, valorAdeudadoTransito: 0 },
    comportamientoInterno: {
      proveedorInfo1ResultadoHabitoPago: null,
      proveedorInfo1PerfilInterno: null,
      proveedorInfo1DiasMoraMaxima: null,
      proveedorInfo1DiasMoraVigente: null,
      proveedorInfo1SaldoCapitalVigente: null,
      esClienteInterno: false,
    },
    metaConsulta: {
      // Todas las fuentes que nombra la disponibilidad menos una: la de las
      // inversiones no contestó.
      fuentesConDatos: [
        "buroCreditoSuper", "buroCreditoDiners", "buroCreditoCoop", "retails", "creditoHipotecario", "creditoQuirografario",
        "basesInternas", "demandas", "trabajoHistoricos", "trabajoHistoricosMecanizado", "afiliacionIess", "afiliacionSalud",
        "vehiculos", "general", "direcciones", "telefonos", "correo", "licenciaConducir",
      ],
      fuentesSinDatos: [
        "deudores", "deudasFirmes", "demandasOfendido", "pensionAlimenticia", "pensionAlimenticiaProveedorInfo1", "denuncias",
        "antecedentesPenales", "listasControl", "listaNegra", "impedimentoCargosPublicos", "sercop", "empleados",
        "cumplimientoPatronal", "jubilados", "pensionista", "afiliacionIssfacCertMedico", "afiliacionIssfacFuerzaArmada",
        "afiliacionIsspol", "afiliacionSiisspol", "contribuyente", "establecimientoActEconomica", "sriImpuestoRenta",
        "administraciones", "bienesInmueble", "polizas", "siniestros", "deudasAnt", "deudasAmt", "deudasEmov", "padres",
        "hijos", "titulos",
      ],
      fuentesNoMedidas: ["inversiones"],
    },
  };
}
