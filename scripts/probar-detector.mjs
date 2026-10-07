// Prueba el detector de eventos (supabase/functions/_shared/eventos-entre-consultas.ts)
// con consultas armadas a mano: sin base, sin red y sin datos de personas.
//
// Lo que tiene que cumplir desde el 2026-10-06: una fuente que no contestó en
// t0 o en t1 no da eventos. Antes los inventaba: en el primer ciclo simulado,
// 44 de los 239 "créditos nuevos en retail" eran deudas viejas de personas
// cuyo retail no había contestado en t0, y con el IESS o el SRI caídos en t1
// todo el que aportaba "perdía el trabajo" y todo RUC activo "cerraba".
// Y lo que no tiene que perder: los eventos de verdad, con las fuentes arriba.
//
// Lo que no pasa por lint ni build se rompe en silencio: correrlo después de
// tocar el detector.
//
// Uso: node scripts/probar-detector.mjs

import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const { eventosEntreConsultas } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/eventos-entre-consultas.ts")).href);

let fallas = 0;
function control(nombre, ok, detalle = "") {
  if (!ok) fallas++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre}${detalle ? ` (${detalle})` : ""}`);
}

const CEDULA = "0000000000";
const caida = { status: "error", data: null, errorMessage: "simulada" };
const ok = (data) => ({ status: "ok", data });
const aporte = (ruc, anio, mes) => ({ rucEmp: ruc, nomEmp: `EMPLEADOR ${ruc}`, anio, mes, salario: "500" });

// Una consulta con todo arriba; `cambios` reemplaza fuentes enteras.
function crudo(cambios = {}) {
  return {
    buroCreditoSuper: ok({ datosSuper: [{ riesgo: "T", codEntidad: "B1", entnombre: "BANCO UNO", calificacion: "A1", saldoVigente: "1000", saldomora: "0", fecha: "2026/08/31" }] }),
    buroCreditoDiners: ok({ datosSuper: [] }),
    buroCreditoCoop: ok({ datosSuper: [{ codRuc: "C1", razon_social: "COOP UNO", num_operacion: "OP1", num_dias_morosidad: "0", val_saldo_total: "800", fec_corte_saldo: "2026/08/31" }] }),
    retails: ok({ retails: [{ institucion: "ALMACEN UNO", totalDeuda: 900, valorVencido: 0, diasMora: 0, fecha: "31/08/26" }] }),
    basesInternas: ok({ data: { tiess: [aporte("E1", 2026, 7), aporte("E1", 2026, 8)] } }),
    contribuyente: ok({ datosContribuyente: [] }),
    establecimientoActEconomica: ok({ datosEstablecimientoActEco: [] }),
    demandas: ok({ demandas: [] }),
    denuncias: ok({ denuncias: [] }),
    pensionAlimenticia: ok({ supas: [] }),
    pensionAlimenticiaNovadata: ok({ supas: [] }),
    ...cambios,
  };
}
const perfil = ({ corte = "2026-08", ruc = false, pension = 0 } = {}) => ({
  fuentesIngreso: { corteIessUsado: corte },
  seguridadSocial: { esJubilado: false },
  laboral: { tieneRucActivo: ruc },
  riesgoJudicialCivil: { valorMensualPensiones: pension, tienePensionAlimenticia: pension > 0 },
});
const t0 = (raw = crudo(), p = perfil()) => ({ raw, perfil: p, fecha: "2026-09-25" });
const t1 = (raw, p = perfil({ corte: "2027-08" })) => ({ raw, perfil: p, fecha: "2027-10-02" });
const detectar = (a, b) => eventosEntreConsultas(a, b, { cedula: CEDULA });
const tipos = (r) => r.eventos.map((e) => e.tipo);

// Las dos consultas iguales (el IESS avanza un año con el mismo empleador).
const igualT1 = crudo({ basesInternas: ok({ data: { tiess: [aporte("E1", 2026, 7), aporte("E1", 2026, 8), aporte("E1", 2027, 8)] } }) });
{
  const r = detectar(t0(), t1(igualT1));
  control("sin cambios: ningún evento", r.eventos.length === 0, tipos(r).join(", "));
  control("sin cambios: el buró se pudo medir", r.disponibilidad.buroMedido === true);
  control("sin cambios: ninguna fuente sin contestar", r.disponibilidad.noContestaron.length === 0, r.disponibilidad.noContestaron.join(", "));
  control("sin cambios: cada operación con su estado de t0", r.buro.operaciones.length === 3 && r.buro.operaciones.every((o) => o.medidaEnT0 && !o.nueva));
}

// Retail caído en t0: lo que trae en t1 no es nuevo, es lo que ya tenía.
{
  const r = detectar(t0(crudo({ retails: caida })), t1(igualT1));
  control("retail caído en t0: no inventa un crédito nuevo", !tipos(r).includes("credito_otra_institucion"), tipos(r).join(", "));
  const op = r.buro.operaciones.find((o) => o.canal === "retail");
  control("retail caído en t0: la operación queda sin medir en t0", op && op.medidaEnT0 === false && op.nueva === false);
  control("retail caído en t0: se dice que no contestó", r.disponibilidad.noContestaron.includes("retails: t0"));
  control("retail caído en t0: el buró igual se mide (bancos y cooperativas)", r.disponibilidad.buroMedido === true);
  control("retail caído en t0: la entidad no entra a las de t1", !r.entidades.t1.some((e) => e.startsWith("retail|")));
}

// Un crédito nuevo de verdad en retail, con las dos consultas arriba.
{
  const conNuevo = crudo({
    basesInternas: igualT1.basesInternas,
    retails: ok({ retails: [
      { institucion: "ALMACEN UNO", totalDeuda: 900, valorVencido: 0, diasMora: 0, fecha: "31/08/27" },
      { institucion: "ALMACEN DOS", totalDeuda: 2500, valorVencido: 600, diasMora: 120, fecha: "31/08/27" },
    ] }),
  });
  const r = detectar(t0(), t1(conNuevo));
  control("crédito nuevo de verdad: lo encuentra", tipos(r).filter((t) => t === "credito_otra_institucion").length === 1, tipos(r).join(", "));
  const op = r.buro.operaciones.find((o) => o.entidad === "ALMACEN DOS");
  control("crédito nuevo de verdad: nueva, medida en t0, con sus días", op && op.nueva && op.medidaEnT0 && op.dias === 120 && op.diasT0 === null);
}

// IESS caído en t1: no se puede decir que perdió el trabajo.
{
  const r = detectar(t0(), t1(crudo({ basesInternas: caida })));
  control("IESS caído en t1: no inventa una pérdida del trabajo", !tipos(r).includes("perdida_trabajo"), tipos(r).join(", "));
  control("IESS caído en t1: el evento queda como no medido", r.disponibilidad.eventosNoMedidos.includes("perdida_trabajo"));
}

// IESS arriba en las dos y sin aportes en t1: la pérdida es de verdad.
{
  const r = detectar(t0(), t1(crudo({ basesInternas: ok({ data: { tiess: [aporte("E1", 2026, 7), aporte("E1", 2026, 8), aporte("E2", 2027, 1)] } }) })));
  control("pérdida del trabajo de verdad: la encuentra", tipos(r).includes("perdida_trabajo"), tipos(r).join(", "));
}

// SRI caído en t1: el RUC "deja de estar activo" porque no hay registro.
{
  const r = detectar(t0(crudo(), perfil({ ruc: true })), t1(crudo({ contribuyente: caida, basesInternas: igualT1.basesInternas }), perfil({ corte: "2027-08", ruc: false })));
  control("SRI caído en t1: no inventa un cierre del negocio", !tipos(r).includes("cierre_negocio"), tipos(r).join(", "));
}

// Buró de bancos caído en t1: no se puede decir que la persona no cayó.
{
  const r = detectar(t0(), t1(crudo({ buroCreditoSuper: caida, basesInternas: igualT1.basesInternas })));
  control("bancos caídos en t1: el buró queda sin medir", r.disponibilidad.buroMedido === false);
  control("bancos caídos en t1: sus operaciones no se listan", !r.buro.operaciones.some((o) => o.fuente === "buroCreditoSuper"));
}

// Demandas caídas en t1: ningún evento de demandas.
{
  const r = detectar(t0(), t1(crudo({ demandas: caida, basesInternas: igualT1.basesInternas })));
  control("demandas caídas en t1: quedan como no medidas", r.disponibilidad.eventosNoMedidos.includes("demanda_civil") && r.disponibilidad.eventosNoMedidos.includes("demanda_cobro"));
}

// Un crédito que ya tenía cae en mora: el corte necesita su estado de t0.
{
  const enMora = crudo({
    basesInternas: igualT1.basesInternas,
    buroCreditoCoop: ok({ datosSuper: [{ codRuc: "C1", razon_social: "COOP UNO", num_operacion: "OP1", num_dias_morosidad: "120", val_saldo_total: "800", val_venc_1: "300", fec_corte_saldo: "2027/08/31" }] }),
  });
  const r = detectar(t0(), t1(enMora));
  control("mora en lo que ya tenía: el evento", tipos(r).includes("mora_credito_previo"), tipos(r).join(", "));
  const op = r.buro.operaciones.find((o) => o.canal === "cooperativas");
  control("mora en lo que ya tenía: la operación trae los días de t0 y de t1", op && op.nueva === false && op.diasT0 === 0 && op.dias === 120);
}

console.log(fallas ? `\n${fallas} FALLAS` : "\nTodo cuadra.");
process.exit(fallas ? 1 : 0);
