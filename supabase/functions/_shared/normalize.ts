// Construye el ClientContext: un resumen CURADO por eje (nombres,
// fechas, montos, estados — no el payload crudo completo de Novadata,
// que incluye árboles de canton/provincia/país innecesarios para el
// juicio crediticio) listo para pasarle al LLM como JSON compacto.
//
// Los nombres de campo usados abajo están confirmados con datos reales
// de 2 casos de prueba (uno "limpio", otro con demandas/mora/antecedentes
// reales) — ver notas inline donde algo sigue siendo parcial.

import type { BlockStatusMap, ClientContext, EjeContext, NovadataEnvelope, RawNovadataResponse } from "./types.ts";

type Multi = Record<string, { status: string; data: NovadataEnvelope | null }> | null | undefined;

function campo(multi: Multi, recurso: string, nombreCampo: string): unknown {
  return multi?.[recurso]?.data?.[nombreCampo];
}

function arr(multi: Multi, recurso: string, nombreCampo: string): Record<string, unknown>[] {
  const v = campo(multi, recurso, nombreCampo);
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function edadDesdeFecha(fechaNacimiento?: string): number | undefined {
  if (!fechaNacimiento) return undefined;
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return undefined;
  const ahora = new Date();
  let edad = ahora.getFullYear() - nacimiento.getFullYear();
  const cumpleEsteAnio = new Date(ahora.getFullYear(), nacimiento.getMonth(), nacimiento.getDate());
  if (ahora < cumpleEsteAnio) edad--;
  return edad;
}

function esFallecido(persona?: { fechaDefuncion?: string | null; informacionAdicional?: string | null } | null): boolean {
  if (!persona) return false;
  if (persona.fechaDefuncion) return true;
  return Boolean((persona.informacionAdicional as string | undefined)?.toUpperCase().includes("FALLEC"));
}

export function buildClientContext(raw: RawNovadataResponse, cedula: string): { context: ClientContext; blockStatus: BlockStatusMap } {
  const blockStatus: BlockStatusMap = {
    general: raw.general.status,
    sociodemografica: raw.sociodemografica.status,
    trabajo: raw.trabajo.status,
    iess: raw.iess.status,
    vehiculos: raw.vehiculos.status,
    funcion_judicial: raw.funcion_judicial.status,
    fiscalia: raw.fiscalia.status,
    bancos: raw.bancos.status,
    cooperativas: raw.cooperativas.status,
  };

  const g = raw.general.data;
  const persona = g?.personaNatural;
  const socio = raw.sociodemografica.data;
  const trabajo = raw.trabajo.data;
  const iess = raw.iess.data;
  const vehiculosData = raw.vehiculos.data;
  const judicial = raw.funcion_judicial.data;
  const fiscalia = raw.fiscalia.data;
  const bancos = raw.bancos.data;
  const cooperativas = raw.cooperativas.data;

  // nova_bases_internas: bundle sin sobre "estado", vive dentro del grupo
  // "bancos" pero alimenta también trabajo (tiess = histórico salarial).
  const basesInternas = bancos?.basesInternas?.data as Record<string, unknown> | undefined;
  const tiess = Array.isArray(basesInternas?.tiess) ? (basesInternas!.tiess as Record<string, unknown>[]) : [];
  const tcredQuirografarios = Array.isArray(basesInternas?.tcredQuirografarios)
    ? (basesInternas!.tcredQuirografarios as Record<string, unknown>[])
    : [];
  const tcredHipotecarios = Array.isArray(basesInternas?.tcredHipotecarios)
    ? (basesInternas!.tcredHipotecarios as Record<string, unknown>[])
    : [];

  const ejeGeneral: EjeContext = {
    status: raw.general.status,
    resumen: g
      ? {
          identificacion: persona?.identificacion,
          nombre: persona?.nombre,
          fechaNacimiento: persona?.fechaNacimiento,
          edad: edadDesdeFecha(persona?.fechaNacimiento as string | undefined),
          genero: (persona?.genero as { descripcion?: string } | undefined)?.descripcion,
          estadoCivil: g.estadoCivil?.estadoCivil?.descripcion,
          nivelEducacion: g.nivelEducacion?.nivelEducacion?.descripcion,
          profesiones: (g.profesiones ?? []).map((p) => p.profesion?.descripcion).filter(Boolean),
          nacionalidad: g.nacionalidades?.[0]?.pais?.nombre,
          conyuge: g.personaNaturalConyuge?.personaConyuge?.nombre || null,
          fallecido: esFallecido(persona as { fechaDefuncion?: string | null; informacionAdicional?: string | null } | undefined),
          informacionAdicional: persona?.informacionAdicional,
        }
      : null,
  };

  const ejeSociodemografica: EjeContext = {
    status: raw.sociodemografica.status,
    resumen: {
      direcciones: arr(socio, "direcciones", "direcciones").map((d) => ({
        tipo: (d.tipoDireccion as { nombre?: string } | undefined)?.nombre,
        calle: (d.direccion as { callePrincipal?: string } | undefined)?.callePrincipal,
      })),
      telefonos: arr(socio, "telefonos", "telefonos").map((t) => ({
        tipo: (t.tipoPersonaTelefono as { nombre?: string } | undefined)?.nombre,
        numero: (t.telefono as { numero?: string } | undefined)?.numero,
      })),
      correos: arr(socio, "correo", "correos").map((c) => c.descripcion),
      padres: arr(socio, "padres", "personasNatural").map((p) => ({
        nombre: p.nombre,
        fallecido: esFallecido(p as { fechaDefuncion?: string | null; informacionAdicional?: string | null }),
      })),
      hijos: arr(socio, "hijos", "personasNatural").map((h) => ({ nombre: h.nombre, fechaNacimiento: h.fechaNacimiento })),
      titulos: arr(socio, "titulos", "titulos"),
      bienesInmueble: arr(socio, "bienesInmueble", "bienesInmueble"),
    },
  };

  const ejeTrabajo: EjeContext = {
    status: raw.trabajo.status,
    resumen: {
      // tiess (nova_bases_internas) es la fuente más completa de
      // histórico laboral CON SALARIO real — priorizarla sobre
      // trabajoHistoricos/mecanizado cuando ambas existan.
      historicoLaboralConSalario: tiess.map((t) => ({
        empleador: t.nomEmp,
        ocupacion: t.ocupacion,
        salario: t.salario,
        fechaIngreso: t.fecIng,
        fechaSalida: t.fecSal,
        periodo: `${t.mes}/${t.anio}`,
      })),
      trabajoHistoricos: arr(trabajo, "trabajoHistoricos", "trabajosHistoricos").map((t) => {
        const pt = t.personaTrabajo as Record<string, unknown> | undefined;
        return {
          patrono: (pt?.personaPatrono as { nombre?: string; nombreComercial?: string } | undefined)?.nombreComercial ??
            (pt?.personaPatrono as { nombre?: string } | undefined)?.nombre,
          cargo: (pt?.cargo as { nombre?: string } | undefined)?.nombre,
          ingresoMensual: (pt?.personaIngreso as { valor?: number } | undefined)?.valor,
          antiguedad: t.antiguedadEmpleado,
        };
      }),
      cumplimientoPatronal: arr(trabajo, "cumplimientoPatronal", "afiliaciones"),
      administraciones: arr(trabajo, "administraciones", "administraciones"),
      contribuyenteSri: arr(trabajo, "contribuyente", "datosContribuyente").map((c) => ({
        rucEstado: c.obligado,
        razonSocial: c.razon_social,
        fechaInscripcion: c.fecha_inscripcion_ruc,
        fechaCancelacion: c.fecha_cancelacion || null,
      })),
      establecimientos: arr(trabajo, "establecimientoActEconomica", "datosEstablecimientoActEco").map((e) => ({
        actividadEconomica: e.act_economica,
        estado: e.estado_establecimiento,
        nombreComercial: e.nombre_comercial,
      })),
    },
  };

  const ejeIess: EjeContext = {
    status: raw.iess.status,
    resumen: {
      afiliacionIess: arr(iess, "afiliacionIess", "afiliacionIess").length > 0,
      afiliacionIsspol: arr(iess, "afiliacionIsspol", "afiliaciones").length > 0,
      afiliacionIssfac:
        arr(iess, "afiliacionIssfacCertMedico", "afiliaciones").length > 0 ||
        arr(iess, "afiliacionIssfacFuerzaArmada", "afiliaciones").length > 0,
      afiliacionSiisspol: arr(iess, "afiliacionSiisspol", "afiliacionSiisspol").map((a) => ({
        estado: a.estado,
        fecha: a.fecha,
      })),
      afiliacionSalud: arr(iess, "afiliacionSalud", "afiliacionSalud").length > 0,
      esPensionista: arr(iess, "pensionista", "pensionista").length > 0,
      esJubilado: arr(iess, "jubilados", "trabajos").length > 0,
    },
  };

  const vehiculos = arr(vehiculosData, "vehiculos", "personaVehiculo");
  const ejeVehiculos: EjeContext = {
    status: raw.vehiculos.status,
    resumen: {
      vehiculos: vehiculos.map((v) => ({
        marca: v.marca,
        modelo: v.modelo,
        anio: v.anioModelo,
        avaluo: v.valorAvaluo,
      })),
      licenciaConducir: arr(vehiculosData, "licenciaConducir", "licencia").map((l) => ({
        puntos: l.puntos,
        tipo: (l.tipoLicencia as { descripcion?: string } | undefined)?.descripcion,
      })),
      siniestros: arr(vehiculosData, "siniestros", "siniestros"),
      polizas: arr(vehiculosData, "polizas", "polizas"),
    },
  };

  const demandaResumen = (d: Record<string, unknown>) => {
    const detalle = d.demanda as Record<string, unknown> | undefined;
    return {
      tipo: (d.tipoDemanda as { descripcion?: string } | undefined)?.descripcion,
      delito: detalle?.delito,
      judicatura: detalle?.judicatura,
      rolComo: detalle?.demandado ? "demandado" : detalle?.ofendido ? "ofendido" : undefined,
    };
  };
  const ejeFuncionJudicial: EjeContext = {
    status: raw.funcion_judicial.status,
    resumen: {
      demandasComoDemandado: arr(judicial, "demandas", "demandas").map(demandaResumen),
      demandasComoOfendido: arr(judicial, "demandasOfendido", "demandas").map(demandaResumen),
      impedimentoCargosPublicos: campo(judicial, "impedimentoCargosPublicos", "data") ?? null,
      pensionAlimenticia: [
        ...arr(judicial, "pensionAlimenticia", "supas"),
        ...arr(judicial, "pensionAlimenticiaNovadata", "supas"),
      ].map((s) => ({
        tipoPension: s.tipoPension,
        valorMensual: s.valorMensual,
        totalPagado: s.totalPagado,
        totalDeuda: s.totalDeuda,
        estado: s.estado,
      })),
    },
  };

  const ejeFiscalia: EjeContext = {
    status: raw.fiscalia.status,
    resumen: {
      denuncias: arr(fiscalia, "denuncias", "denuncias"),
      antecedentesPenales: (() => {
        const a = campo(fiscalia, "antecedentesPenales", "antecedentes") as
          | { descripcion?: string; idAntecedente?: number }
          | null
          | undefined;
        return a ? { descripcion: a.descripcion } : null;
      })(),
      sercop: (() => {
        const d = campo(fiscalia, "sercop", "data") as
          | { contraloria?: { registros?: unknown[] }; sercop?: { registros?: unknown[] } }
          | undefined;
        return {
          registrosContraloria: d?.contraloria?.registros?.length ?? 0,
          registrosSercop: d?.sercop?.registros?.length ?? 0,
        };
      })(),
    },
  };

  const centralRiesgoResumen = (r: Record<string, unknown>) => ({
    entidad: r.entnombre ?? r.razon_social,
    calificacion: r.calificacion,
    diasMora: r.mora ?? r.num_dias_morosidad,
    saldo: r.saldoVigente ?? r.val_saldo_total,
    judicial: r.judicial ?? r.val_dem_judicial,
    castigado: r.castigo ?? r.val_cart_castigada,
  });

  const ejeBancos: EjeContext = {
    status: raw.bancos.status,
    resumen: {
      centralRiesgo: [...arr(bancos, "centralRiesgoSuper", "datosSuper"), ...arr(bancos, "centralRiesgoDiners", "datosSuper")].map(
        centralRiesgoResumen
      ),
      retails: arr(bancos, "retails", "retails").map((r) => ({
        institucion: r.institucion,
        valorVencido: r.valorVencido,
        totalDeuda: r.totalDeuda,
        diasMora: r.diasMora,
      })),
      creditosAfiliadosIess: [...tcredQuirografarios, ...tcredHipotecarios].map((c) => ({
        estado: c.estadoOperacion,
        montoTransferido: c.montoTransferido,
        saldoTotal: c.saldoTotalCredito,
        diasMora: c.diasMoraAfi,
      })),
      prestamosHipotecarios: arr(bancos, "creditoHipotecario", "prestamos"),
      prestamosQuirografarios: arr(bancos, "creditoQuirografario", "prestamos"),
      deudasFirmes: arr(bancos, "deudasFirmes", "deudasFirmes"),
      deudasTransito: arr(bancos, "deudasEmov", "deudaEmov").map((d) => ({
        valorAdeudado: d.valorAdeudado,
      })),
      inversiones: arr(bancos, "inversiones", "inversiones"),
    },
  };

  const ejeCooperativas: EjeContext = {
    status: raw.cooperativas.status,
    resumen: {
      centralRiesgoCoop: arr(cooperativas, "centralRiesgoCoop", "datosSuper").map((c) => ({
        entidad: c.razon_social,
        diasMora: c.num_dias_morosidad,
        saldo: c.val_saldo_total,
        judicial: c.val_dem_judicial,
        castigado: c.val_cart_castigada,
      })),
    },
  };

  const context: ClientContext = {
    cedula,
    ejes: {
      general: ejeGeneral,
      sociodemografica: ejeSociodemografica,
      trabajo: ejeTrabajo,
      iess: ejeIess,
      vehiculos: ejeVehiculos,
      funcion_judicial: ejeFuncionJudicial,
      fiscalia: ejeFiscalia,
      bancos: ejeBancos,
      cooperativas: ejeCooperativas,
    },
  };

  return { context, blockStatus };
}
