// El catálogo de detectores de la revisión de datos (habilidad `revision-de-datos`).
//
// Cada detector es un error que ya encontramos en un caso real, escrito como
// consulta para que se mida en toda la cartera y no vuelva sin que nadie lo
// note. Nacieron de la revisión de casos del 2026-10-31 al 2026-11-05: el negocio
// encontró a mano errores en la fuente, la estructura, los ingresos, lo que lee
// el modelo y lo que responde, y cada uno se midió después en la cartera (el A2
// leído como «sin atraso», el retail con corte de 2025, la pasantía de 2019
// leída como cargo vigente, el análisis hecho con 41 de 52 fuentes caídas...).
//
// Cómo se suma uno (la habilidad lo explica entero):
//   - `id` en minúsculas con guiones, que no cambia: la comparación entre
//     corridas se hace por id.
//   - `capa`: dónde nace el error (ver CAPAS). Un detector mide UNA capa.
//   - `tipo`:
//       "regresion"  un error ya corregido. Tiene que dar 0; si no, el guion
//                    sale con 1. Es la prueba de que el arreglo sigue puesto.
//       "revisar"    una inconsistencia exacta que hay que mirar caso por caso.
//       "confirmar"  busca frases o umbrales: tiene falsos positivos.
//   - `conocido` (opcional): qué se decidió sobre lo que marca, para que el
//     próximo que lo corra no lo investigue de nuevo. Sin `conocido`, un caso
//     es un hallazgo abierto.
//   - `caso`: la referencia c-xxxxxxxx del caso que lo originó (nunca una cédula:
//     el repositorio es público) y la fecha.
//   - `poblacion`: SQL que cuenta sobre cuántas personas se mide. Si da 0, el
//     detector queda «no medido», no «sin casos».
//   - `casos`: SQL que devuelve `client_id` y `detalle` (jsonb). El detalle puede
//     llevar montos: va a research/, fuera de git. A la consola salen conteos y
//     referencias c-xxxxxxxx.
//
// Las tablas comunes (`ultimo`, `analisis`, `equifax`) están en BASE. Sólo
// personas reales: las 240 sintéticas de Aval no cuentan (118).
//
// AVISO: este archivo no pasa por lint ni build. Después de tocarlo, correr
// `node scripts/revisar-datos.mjs --solo=<id>` y mirar el detalle de un caso.

import { FUENTES } from "../../supabase/functions/_shared/calidad-de-la-consulta.ts";
import { FUENTES_DEL_PREDICTOR } from "../../supabase/functions/_shared/estimacion-de-ingreso.ts";
import { evaluarControlesBloqueo } from "../../supabase/functions/_shared/controles-bloqueo.ts";
import { delitosDeSeguridadEnDemandas } from "../../supabase/functions/_shared/delitos-seguridad.ts";

export const CAPAS = {
  fuente: "1. Fuente (lo que contestó Proveedor_Info_1 o Equifax)",
  estructura: "2. Estructura estandarizada (process.ts)",
  ingresos: "3. Perfil de ingresos (fuentes-ingreso.ts)",
  predictor: "4. Predictor de ingresos",
  cruce: "5. Cruce entre Proveedor_Info_1 y Equifax",
  modelo: "6. Respuesta del modelo",
};

// Las obligatorias y su «no hay» salen de la regla del freno, importada del
// código (Node 24 lee el .ts): la primera versión de este archivo copiaba las 5
// fuentes del PR 104, que el 2026-11-04 pasaron a ser 21, y contaba 671
// consultas incompletas en vez de las de verdad.
const OBLIGATORIAS = Object.entries(FUENTES).filter(([, f]) => f.nivel === "obligatoria");
// laObligatoriaContesto(): ok, ok_vacio y deshabilitado contestan; faltante,
// sólo donde es el «no hay» de esa fuente. Un estado vacío no frena.
const noContesto = (columna, [fuente, ficha]) => {
  const contesta = ficha.noHay === "faltante" ? `('ok', 'ok_vacio', 'deshabilitado', 'faltante')` : `('ok', 'ok_vacio', 'deshabilitado')`;
  return `coalesce(${columna}->>'${fuente}', 'faltante') not in ${contesta}`;
};
const algunaClaveCaida = (columna, fuentes = OBLIGATORIAS) =>
  `(${columna} is not null and ${columna} <> '{}'::jsonb and (` + fuentes.map((o) => noContesto(columna, o)).join(" or ") + "))";
const clavesCaidas = (columna, fuentes = OBLIGATORIAS) =>
  "array_remove(array[" + fuentes.map((o) => `case when ${noContesto(columna, o)} then '${o[0]}' end`).join(", ") + "], null)";
// Las del freno del predictor (estimacion-de-ingreso.ts), con su ficha.
const DEL_PREDICTOR = OBLIGATORIAS.filter(([f]) => FUENTES_DEL_PREDICTOR.includes(f));

export const BASE = `
reales as (select id from clients where not es_sintetico),
ultimo_id as (
  select distinct on (p.client_id) p.id
  from client_profiles p join reales r on r.id = p.client_id
  order by p.client_id, p.created_at desc
),
ultimo as (
  select p.id as perfil_id, p.client_id, p.created_at, p.structure_version, p.estado_por_fuente,
         p.standard_profile as sp
  from client_profiles p join ultimo_id u on u.id = p.id
),
analisis_id as (
  select distinct on (a.client_id) a.id
  from analysis_results a join reales r on r.id = a.client_id
  where a.fallo is null and a.crediscope_score is not null
  order by a.client_id, a.created_at desc
),
analisis as (
  select a.id, a.client_id, a.created_at, a.rules_version, a.crediscope_score, a.client_profile_id,
         coalesce(a.narrative_summary, '') || ' ' || coalesce(a.positives::text, '') || ' ' ||
         coalesce(a.negatives::text, '') || ' ' || coalesce(a.missing_info::text, '') as texto
  from analysis_results a join analisis_id u on u.id = a.id
),
equifax as (
  select distinct on (q.client_id) q.id as consulta_id, q.client_id, q.created_at
  from consultas_equifax q join reales r on r.id = q.client_id
  where q.http_equifax = 200 and exists (select 1 from equifax_resumen s where s.consulta_equifax_id = q.id)
  order by q.client_id, q.created_at desc
)`;

export const DETECTORES = [
  // ── 1. Fuente ────────────────────────────────────────────────────────────
  {
    id: "analisis-con-obligatoria-sin-respuesta",
    capa: "fuente",
    tipo: "regresion",
    titulo: "Análisis hecho después del freno con una fuente obligatoria sin respuesta",
    caso: "c-79e1ac23, 2026-10-31: analizado con 41 de 52 fuentes en error, sin ver un hipotecario del BIESS",
    // El freno (PR 104) se desplegó el 2026-10-31; lo anterior queda como estaba.
    poblacion: `select count(*) from analisis where created_at >= '2026-11-01'`,
    casos: `
      select a.client_id, jsonb_build_object('marco', a.rules_version, 'analizado', a.created_at,
             'caidas', ${clavesCaidas("p.estado_por_fuente")}) as detalle
      from analisis a join client_profiles p on p.id = a.client_profile_id
      where a.created_at >= '2026-11-01' and ${algunaClaveCaida("p.estado_por_fuente")}`,
  },
  {
    id: "consulta-incompleta-sin-reconsultar",
    capa: "fuente",
    tipo: "revisar",
    conocido: "el freno no las deja analizar; se resuelve reconsultando (docs/pendientes.md, «Freno por consulta incompleta»)",
    titulo: "Último perfil con una fuente obligatoria sin respuesta (no se puede analizar)",
    caso: "freno del 2026-10-31: docs/pendientes.md, «Freno por consulta incompleta», contó 769 de 3.765",
    poblacion: `select count(*) from ultimo where estado_por_fuente is not null and estado_por_fuente <> '{}'::jsonb`,
    casos: `
      select client_id, jsonb_build_object('consultado', created_at, 'caidas', ${clavesCaidas("estado_por_fuente")}) as detalle
      from ultimo where ${algunaClaveCaida("estado_por_fuente")}`,
  },
  {
    id: "retail-con-corte-viejo",
    capa: "fuente",
    tipo: "revisar",
    conocido: "es el corte que entrega Proveedor_Info_1; desde estructura-v16 llega al modelo como fechaCorteRetail",
    titulo: "Deudas en casas comerciales con un corte de más de 6 meses antes de la consulta",
    caso: "c-82cc2afc, 2026-10-31: el retail de Proveedor_Info_1 venía con corte 31/07/2025",
    poblacion: `select count(*) from ultimo where (sp->'comportamientoBancario'->>'numeroDeudasRetail')::int > 0`,
    casos: `
      select client_id, jsonb_build_object('corte', sp->'comportamientoBancario'->>'fechaCorteRetail',
             'consultado', sp->>'consultadoEn') as detalle
      from ultimo
      where (sp->'comportamientoBancario'->>'numeroDeudasRetail')::int > 0
        and (sp->'comportamientoBancario'->>'fechaCorteRetail')::date
            < (sp->>'consultadoEn')::timestamptz::date - interval '6 months'`,
  },

  // ── 2. Estructura ────────────────────────────────────────────────────────
  {
    id: "perfil-con-estructura-atrasada",
    capa: "estructura",
    tipo: "regresion",
    titulo: "Último perfil en una versión de estructura que no es la vigente",
    caso: "recálculos del 2026-10-31 y del 2026-11-05: un perfil atrasado no tiene las correcciones",
    // {{PROCESS_VERSION}} lo pone el guion, leído de process.ts.
    poblacion: `select count(*) from ultimo`,
    casos: `
      select client_id, jsonb_build_object('version', structure_version) as detalle
      from ultimo where structure_version is distinct from '{{PROCESS_VERSION}}'`,
  },
  {
    id: "prestamos-biess-sin-marcar",
    capa: "estructura",
    tipo: "regresion",
    // Corregido en estructura-v16 (2026-10-31): 0 de 918 el 2026-11-05.
    titulo: "Préstamos del IESS/BIESS contados pero tieneCreditoIessBiess en falso",
    caso: "c-82cc2afc, 2026-10-31: 9 préstamos y tieneCreditoIessBiess=false",
    poblacion: `select count(*) from ultimo where (sp->'comportamientoBancario'->>'numeroCreditosFormales')::int > 0`,
    casos: `
      select client_id, jsonb_build_object('prestamos', sp->'comportamientoBancario'->'numeroCreditosFormales',
             'saldo', sp->'comportamientoBancario'->'saldoPrestamosIessBiess') as detalle
      from ultimo
      where (sp->'comportamientoBancario'->>'numeroCreditosFormales')::int > 0
        and coalesce((sp->'comportamientoBancario'->>'tieneCreditoIessBiess')::boolean, false) = false`,
  },
  {
    id: "cargo-vigente-sin-aporte-vigente",
    capa: "estructura",
    // Corregido en estructura-v19 (2026-11-05): de los 23 de la primera corrida,
    // 17 habían dejado de aportar un corte antes y el mecanizado los daba con
    // empleo actual. Los otros 6 tenían basesInternas en error: el cargo era
    // cierto y la consulta, incompleta. Sólo cuentan las consultas en que los
    // aportes contestaron.
    tipo: "regresion",
    titulo: "Cargo vigente sin ningún aporte de un empleador vigente al corte, con los aportes del IESS contestados",
    caso: "c-5ee429cc, 2026-10-31 (pasantía de 2019 leída como cargo vigente); c-d4625b8b, 2026-11-05 (dejó de aportar un corte antes)",
    poblacion: `select count(*) from ultimo where sp->'laboral'->>'cargoVigente' is not null
      and estado_por_fuente->>'basesInternas' in ('ok', 'ok_vacio')`,
    casos: `
      select client_id, jsonb_build_object('cargo', sp->'laboral'->>'cargoVigente',
             'antiguedadEmpleadorAnios', sp->'laboral'->'empleadorVigenteAntiguedadAnios') as detalle
      from ultimo
      where sp->'laboral'->>'cargoVigente' is not null
        and estado_por_fuente->>'basesInternas' in ('ok', 'ok_vacio')
        and not jsonb_path_exists(coalesce(sp->'fuentesIngreso'->'fuentes', '[]'),
                                  '$[*] ? (@.vigenteAlCorte == true && @.empleador != null)')`,
  },

  // ── 3. Perfil de ingresos ────────────────────────────────────────────────
  {
    id: "salario-mas-alto-bajo-un-empleo-vigente",
    capa: "ingresos",
    // Corregido en estructura-v17 (2026-10-31): 0 de 1.954 el 2026-11-05.
    tipo: "regresion",
    titulo: "Salario más alto registrado por debajo de lo que reporta hoy un solo empleo vigente (5% de margen)",
    caso: "c-82cc2afc, 2026-10-31: «salario más alto» de un empleo de 2018 contra un ingreso reportado varias veces mayor",
    // Contra el empleo vigente más alto y no contra el ingreso reportado: el
    // reportado suma los empleos, y la primera corrida (2026-11-05) marcaba a
    // quien tiene dos empleos de lo mismo (60 casos, la mayoría así).
    poblacion: `select count(*) from ultimo
      where (sp->'laboral'->>'salarioMasAltoRegistrado')::numeric > 0
        and jsonb_path_exists(coalesce(sp->'fuentesIngreso'->'fuentes', '[]'), '$[*] ? (@.vigenteAlCorte == true && @.montoMensualReportado > 0)')`,
    casos: `
      select client_id, jsonb_build_object('salarioMasAlto', sp->'laboral'->'salarioMasAltoRegistrado',
             'empleoVigenteMasAlto', vigente) as detalle
      from (
        select client_id, sp,
               (select max((f->>'montoMensualReportado')::numeric)
                  from jsonb_array_elements(coalesce(sp->'fuentesIngreso'->'fuentes', '[]')) f
                 where (f->>'vigenteAlCorte')::boolean) as vigente
        from ultimo
        where (sp->'laboral'->>'salarioMasAltoRegistrado')::numeric > 0
      ) x
      where vigente > 0 and (sp->'laboral'->>'salarioMasAltoRegistrado')::numeric < 0.95 * vigente`,
  },
  {
    id: "ingreso-reportado-sin-fuente-vigente",
    capa: "ingresos",
    tipo: "regresion",
    // 0 de 1.954 el 2026-11-05: es una regla del cálculo, no un hallazgo.
    titulo: "Ingreso reportado mayor que cero sin ninguna fuente vigente al corte",
    caso: "regla de fuentes-ingreso.ts: el reportado es la suma de las fuentes vigentes",
    poblacion: `select count(*) from ultimo where (sp->'fuentesIngreso'->>'pisoIngresoMensualReportado')::numeric > 0`,
    casos: `
      select client_id, jsonb_build_object('reportadoIess', sp->'fuentesIngreso'->'pisoIngresoMensualReportado') as detalle
      from ultimo
      where (sp->'fuentesIngreso'->>'pisoIngresoMensualReportado')::numeric > 0
        and not jsonb_path_exists(coalesce(sp->'fuentesIngreso'->'fuentes', '[]'), '$[*] ? (@.vigenteAlCorte == true)')`,
  },

  // ── 4. Predictor de ingresos ─────────────────────────────────────────────
  // La primera versión comparaba la estimación con el ingreso reportado al IESS,
  // pero el predictor estima sólo a quien no lo tiene verificado (decidirEstimacion):
  // esa población iba a estar siempre vacía. Mientras estimaciones_de_ingreso esté
  // vacía, el predictor se mide sin guardar con scripts/estimar-ingresos-en-lote.mjs.
  {
    id: "estimacion-sobre-consulta-incompleta",
    capa: "predictor",
    // El freno (negocio, 2026-11-05): sin la identidad, los aportes o el RUC no se
    // estima. Las demás obligatorias no frenan y este detector no las mira.
    tipo: "regresion",
    titulo: "Estimación hecha sin la identidad, los aportes o el RUC",
    caso: "estimar-ingresos-en-lote.mjs, 2026-11-05: sin el freno, 624 de 2.061 estimaciones eran de consultas incompletas, 552 sin edad ni sexo",
    poblacion: `select count(*) from estimaciones_de_ingreso`,
    casos: `
      select e.client_id, jsonb_build_object('estimado', e.valor_central, 'minimo90', e.minimo_90,
             'caidas', ${clavesCaidas("p.estado_por_fuente", DEL_PREDICTOR)}) as detalle
      from estimaciones_de_ingreso e join client_profiles p on p.id = e.client_profile_id
      where ${algunaClaveCaida("p.estado_por_fuente", DEL_PREDICTOR)}`,
  },
  {
    id: "estimacion-lejos-de-equifax",
    capa: "predictor",
    tipo: "confirmar",
    titulo: "Estimación del predictor a más del doble o menos de la mitad del ingreso que estima Equifax",
    caso: "estimar-ingresos-en-lote.mjs, 2026-11-05: en 52 personas con las dos, razón mediana 0,74; 7 más del doble y 14 menos de la mitad",
    poblacion: `select count(*) from estimaciones_de_ingreso e join equifax q on q.client_id = e.client_id
      join equifax_resumen s on s.consulta_equifax_id = q.consulta_id where s.ingreso_estimado_usd > 0`,
    casos: `
      select e.client_id, jsonb_build_object('estimado', e.valor_central, 'equifax', s.ingreso_estimado_usd) as detalle
      from estimaciones_de_ingreso e join equifax q on q.client_id = e.client_id
      join equifax_resumen s on s.consulta_equifax_id = q.consulta_id
      where s.ingreso_estimado_usd > 0
        and (e.valor_central > 2 * s.ingreso_estimado_usd or e.valor_central < 0.5 * s.ingreso_estimado_usd)`,
  },

  // ── 5. Cruce entre Proveedor_Info_1 y Equifax ────────────────────────────
  {
    id: "mora-comercial-que-solo-ve-equifax",
    capa: "cruce",
    tipo: "revisar",
    conocido: "desde marco-v35 (2026-11-05) el modelo lee el buró de la institución, que trae esta mora",
    titulo: "Equifax trae una deuda comercial propia con 90 días o más de mora y el retail de Proveedor_Info_1 no",
    caso: "c-82cc2afc, 2026-10-31: casas comerciales con más de 200 días en Equifax que Proveedor_Info_1 no mostraba",
    poblacion: `select count(*) from equifax e join ultimo u on u.client_id = e.client_id`,
    casos: `
      select e.client_id, jsonb_build_object(
               'diasEquifax', max(o.dias_morosidad),
               'diasProveedorInfo1', max(u.sp->'comportamientoBancario'->>'diasMoraMaximaRetail'),
               'empresas', count(distinct o.institucion)) as detalle
      from equifax e
      join ultimo u on u.client_id = e.client_id
      join equifax_operaciones o on o.consulta_equifax_id = e.consulta_id
      where o.sistema = 'comercial' and o.rol = 'titular' and o.dias_morosidad >= 90
        and coalesce((u.sp->'comportamientoBancario'->>'diasMoraMaximaRetail')::int, 0) < 90
      group by e.client_id`,
  },
  {
    id: "ruc-suspension-difiere",
    capa: "cruce",
    tipo: "revisar",
    titulo: "La fecha de suspensión definitiva del RUC en Equifax no es la del último cese en Proveedor_Info_1",
    caso: "c-79e1ac23, 2026-10-31: las dos fuentes decían suspendido el mismo día, pero la pantalla de Equifax no lo mostraba",
    // Los dos casos del 2026-11-05 (c-0be1e991, c-74997fb7) los revisó el negocio en
    // el SRI: la suspensión es la misma en las tres fuentes. Proveedor_Info_1 trae
    // además una cancelación posterior que el SRI ya no muestra, y no trae el
    // reinicio de 2025. Ver ruc-activo-difiere.
    conocido: "Proveedor_Info_1 suma una cancelación que el SRI ya no muestra; la suspensión coincide (SRI, 2026-11-05)",
    poblacion: `select count(*) from equifax e join equifax_resumen s on s.consulta_equifax_id = e.consulta_id
      join ultimo u on u.client_id = e.client_id where s.sri_tiene_ruc`,
    casos: `
      select e.client_id, jsonb_build_object('equifax', s.sri_fecha_suspension_definitiva,
             'proveedorInfo1', u.sp->'laboral'->>'fechaCeseActividadesRuc',
             'tipoCese', u.sp->'laboral'->>'tipoUltimoCeseRuc', 'estadoEquifax', s.sri_estado_contribuyente) as detalle
      from equifax e
      join equifax_resumen s on s.consulta_equifax_id = e.consulta_id
      join ultimo u on u.client_id = e.client_id
      where s.sri_tiene_ruc
        and s.sri_fecha_suspension_definitiva is distinct from
            case when u.sp->'laboral'->>'tipoUltimoCeseRuc' = 'suspension_definitiva'
                 then (u.sp->'laboral'->>'fechaCeseActividadesRuc')::date end`,
  },
  {
    id: "ruc-inicio-difiere",
    capa: "cruce",
    tipo: "revisar",
    titulo: "La fecha de inicio de actividades del RUC en Equifax no es la de Proveedor_Info_1",
    caso: "c-79e1ac23, 2026-10-31: pedido del negocio de validar las fechas del RUC entre las dos fuentes",
    poblacion: `select count(*) from equifax e join equifax_resumen s on s.consulta_equifax_id = e.consulta_id
      join ultimo u on u.client_id = e.client_id
      where s.sri_fecha_inicio_actividades is not null and u.sp->'laboral'->>'fechaInicioActividadesRuc' is not null`,
    casos: `
      select e.client_id, jsonb_build_object('equifax', s.sri_fecha_inicio_actividades,
             'proveedorInfo1', u.sp->'laboral'->>'fechaInicioActividadesRuc') as detalle
      from equifax e
      join equifax_resumen s on s.consulta_equifax_id = e.consulta_id
      join ultimo u on u.client_id = e.client_id
      where s.sri_fecha_inicio_actividades is not null and u.sp->'laboral'->>'fechaInicioActividadesRuc' is not null
        and s.sri_fecha_inicio_actividades <> (u.sp->'laboral'->>'fechaInicioActividadesRuc')::date`,
  },
  {
    id: "ruc-activo-difiere",
    capa: "cruce",
    tipo: "revisar",
    titulo: "Equifax y el perfil no dicen lo mismo de si el RUC está activo",
    caso: "c-0be1e991 y c-74997fb7, 2026-11-05: el SRI los muestra ACTIVOS desde un reinicio de 2025 que el crudo de Proveedor_Info_1 del 2026-10-03 no trae; Equifax sí los da activos",
    poblacion: `select count(*) from equifax e join equifax_resumen s on s.consulta_equifax_id = e.consulta_id
      join ultimo u on u.client_id = e.client_id
      where s.sri_tiene_ruc and s.sri_estado_contribuyente is not null and u.sp->'laboral'->>'tieneRucActivo' is not null`,
    casos: `
      select e.client_id, jsonb_build_object('estadoEquifax', s.sri_estado_contribuyente,
             'activoProveedorInfo1', u.sp->'laboral'->'tieneRucActivo', 'tipoCese', u.sp->'laboral'->>'tipoUltimoCeseRuc',
             'consultaEquifax', e.created_at::date, 'consultaProveedorInfo1', u.created_at::date) as detalle
      from equifax e
      join equifax_resumen s on s.consulta_equifax_id = e.consulta_id
      join ultimo u on u.client_id = e.client_id
      where s.sri_tiene_ruc and s.sri_estado_contribuyente is not null and u.sp->'laboral'->>'tieneRucActivo' is not null
        and (upper(s.sri_estado_contribuyente) = 'ACTIVO') <> (u.sp->'laboral'->>'tieneRucActivo')::boolean`,
  },

  // ── 6. Respuesta del modelo ──────────────────────────────────────────────
  {
    id: "atraso-leido-como-sin-atraso",
    capa: "modelo",
    tipo: "confirmar",
    conocido: "marco-v32 definió A2 como atraso; los análisis anteriores siguen en la bandeja hasta que se rehagan",
    titulo: "El análisis dice «sin atraso» o «sin mora» y la peor calificación propia es A2 o peor",
    caso: "c-82cc2afc, 2026-10-31: A1/A2 leído «sin atraso» cuando A2 ya son días de mora",
    poblacion: `select count(*) from analisis a join ultimo u on u.client_id = a.client_id
      where u.sp->'comportamientoBancario'->>'peorCalificacionRiesgo' is not null`,
    casos: `
      select a.client_id, jsonb_build_object('marco', a.rules_version,
             'peorCalificacion', u.sp->'comportamientoBancario'->>'peorCalificacionRiesgo') as detalle
      from analisis a join ultimo u on u.client_id = a.client_id
      where u.sp->'comportamientoBancario'->>'peorCalificacionRiesgo' ~ '^(A2|A3|B|C|D|E)'
        and a.texto ~* '(sin|ning[uú]n|no (registra|presenta|tiene)) (atrasos?|moras?|morosidad)'`,
  },
  {
    id: "frase-retirada-en-el-analisis",
    capa: "modelo",
    tipo: "regresion",
    titulo: "Un análisis de marco-v32 o posterior usa una frase que el marco retiró",
    caso: "c-79e1ac23, 2026-10-31: «nadie miró» en lugar de decir que no se pudo obtener la información",
    poblacion: `select count(*) from analisis where substring(rules_version from 'marco-v(\\d+)')::int >= 32`,
    casos: `
      select client_id, jsonb_build_object('marco', rules_version) as detalle
      from analisis
      where substring(rules_version from 'marco-v(\\d+)')::int >= 32
        and texto ~* '(nadie mir|asalariad|puntaje)'`,
  },
  {
    id: "analisis-con-marco-sin-registrar",
    capa: "modelo",
    tipo: "regresion",
    titulo: "Análisis con una versión del marco que no tiene su fila en scoring_rules_versions",
    caso: "regla de supabase/CLAUDE.md: cada versión del marco lleva su fila",
    poblacion: `select count(*) from analisis`,
    casos: `
      select client_id, jsonb_build_object('marco', rules_version) as detalle
      from analisis a
      where not exists (select 1 from scoring_rules_versions v where v.version = a.rules_version)`,
  },
  {
    id: "score-fuera-de-rango",
    capa: "modelo",
    tipo: "regresion",
    titulo: "Score fuera de 1 a 999",
    caso: "el score de CrediScope va de 1 a 999",
    poblacion: `select count(*) from analisis`,
    casos: `
      select client_id, jsonb_build_object('score', crediscope_score) as detalle
      from analisis where crediscope_score not between 1 and 999`,
  },
];

// ── Sobre el crudo ──────────────────────────────────────────────────────────
//
// Lo que no se ve en la base: un error que nace al leer el crudo de
// Proveedor_Info_1 (una operación contada dos veces, un demandado que no es la
// persona) no deja rastro en el perfil guardado, que ya lo trae mezclado. Estos
// detectores leen el crudo del último perfil de cada persona real (la carpeta de
// research/ y, lo que no está ahí, el depósito) y lo comparan con el perfil y el
// bloqueo guardados. Los corre `node scripts/revisar-crudo.mjs`: sólo lee, no
// cuesta, y escribe el detalle en research/revision-de-datos/.
//
// Cada uno es como los de arriba (id, capa, tipo, titulo, caso, conocido), con
// dos funciones en vez de SQL. Las dos reciben { raw, cedula, perfil, bloqueo }:
// el crudo y lo guardado en client_profiles (standard_profile, control_bloqueo).
//   - `aplica`: ¿la persona entra en la población?
//   - `detectar`: el detalle del caso, o null. Sin cédulas ni nombres: va a
//     research/, pero se cita por consola.
// La regla se importa del .ts (Node 24 lo lee), nunca se copia.
export const DETECTORES_DEL_CRUDO = [
  {
    id: "bloqueo-por-demanda-de-otro-demandado",
    capa: "estructura",
    tipo: "regresion",
    titulo: "Bloqueada por un delito de seguridad ciudadana que sólo sale de demandas en las que el demandado no es la persona",
    caso: "c-14f9ee80, 2026-11-06: bloqueada por una demanda de narcotráfico contra otros procesados (p1 de la revisión del análisis, estructura-v20)",
    conocido: "se corrige con el recálculo de estructura-v20 (recalcular-grupos.mjs --grupos=riesgoSeguridadCiudadana --bloqueo)",
    aplica: ({ bloqueo }) => (bloqueo?.hallazgos ?? []).some((h) => h.code === "delito_seguridad_ciudadana"),
    detectar: ({ raw, cedula, bloqueo }) => {
      const ahora = evaluarControlesBloqueo(raw, cedula);
      if (ahora.hallazgos.some((h) => h.code === "delito_seguridad_ciudadana")) return null;
      const persona = raw.general?.data?.personaNatural;
      const { sinCotejo } = delitosDeSeguridadEnDemandas(raw.demandas?.data?.demandas ?? [], persona?.nombre);
      return {
        // Si sigue bloqueada por otro control (lista negra, OFAC...), el
        // análisis no cambia: sólo cambia el motivo.
        sigueBloqueada: ahora.bloqueado,
        antes: bloqueo.hallazgos.filter((h) => h.bloqueante).map((h) => h.code),
        cotejos: sinCotejo.map((s) => s.cotejo),
        delitos: [...new Set(sinCotejo.flatMap((s) => s.categorias))],
        anios: sinCotejo.map((s) => s.anio),
      };
    },
  },
  {
    id: "prestamo-biess-contado-dos-veces",
    capa: "estructura",
    tipo: "revisar",
    titulo: "Un préstamo del IESS/BIESS que está en la base interna y en la fuente de préstamos con otro número y la fecha corrida: se suma dos veces",
    caso: "c-b9fc9a82, 2026-11-06: el hipotecario, con el mismo monto y la concesión a 2 días, contado dos veces (p6 de la revisión del análisis)",
    aplica: ({ raw }) => opsDeLaBase(raw).length > 0 && opsDeLosPrestamos(raw).length > 0,
    detectar: ({ raw }) => {
      const base = opsDeLaBase(raw);
      const repetidas = [];
      for (const p of opsDeLosPrestamos(raw)) {
        // La regla vigente ya une por número o por fecha y monto exactos.
        if (base.some((b) => (b.numero && b.numero === p.numero) || (b.concesion === p.concesion && Math.round(b.monto) === Math.round(p.monto)))) continue;
        const par = base.find((b) => Math.abs(b.monto - p.monto) <= 1 && b.dia !== null && p.dia !== null && Math.abs(b.dia - p.dia) <= 31);
        if (par) repetidas.push({ tipo: p.tipo, dias: Math.abs(par.dia - p.dia), saldoBase: par.saldo, saldoPrestamos: p.saldo });
      }
      return repetidas.length ? { repetidas, saldoContadoDeMas: Math.round(repetidas.reduce((s, r) => s + Math.min(r.saldoBase, r.saldoPrestamos), 0)) } : null;
    },
  },
  {
    id: "prestamo-biess-terminado-contado",
    capa: "estructura",
    tipo: "revisar",
    titulo: "Un préstamo del IESS/BIESS de la base interna con el plazo ya cumplido (o no vigente) que suma saldo",
    caso: "c-40d771e1, 2026-11-06: un quirografario que terminó en 2023 seguía «VIGENTE» en la base interna y sumaba saldo (p6)",
    aplica: ({ raw }) => opsDeLaBase(raw).length > 0,
    detectar: ({ raw, capturadoEl }) => {
      const hoy = Math.floor(new Date(capturadoEl).getTime() / 86400000);
      const prestamos = opsDeLosPrestamos(raw);
      const terminadas = opsDeLaBase(raw).filter((b) => {
        if (b.saldo <= 0) return false;
        // Si la fuente de préstamos la trae, la fuente de préstamos manda.
        if (prestamos.some((p) => (b.numero && b.numero === p.numero) || (Math.abs(b.monto - p.monto) <= 1 && Math.abs((b.dia ?? 0) - (p.dia ?? 0)) <= 31))) return false;
        return b.estado !== "VIGENTE" || (b.fin !== null && b.fin < hoy && b.diasMora === 0);
      });
      return terminadas.length
        ? { terminadas: terminadas.map((b) => ({ tipo: b.tipo, estado: b.estado, finHaceDias: b.fin === null ? null : hoy - b.fin, saldo: b.saldo })) }
        : null;
    },
  },
  {
    id: "cartera-de-la-institucion-con-una-sola-operacion",
    capa: "estructura",
    tipo: "revisar",
    titulo: "La institución tiene varias operaciones con la persona y el perfil lee sólo la primera",
    caso: "c-5dfb1e00, 2026-11-06: llegaba una operación cancelada y escondía la vigente, sin cuota ni cuotas pagadas (p3 de la revisión del análisis)",
    aplica: ({ raw }) => operacionesDeLaInstitucion(raw).length > 0,
    detectar: ({ raw }) => {
      const ops = operacionesDeLaInstitucion(raw);
      const vigentes = ops.filter((o) => String(o.estadoOperacion ?? "").toUpperCase() !== "CANCELADA");
      const primeraCancelada = String(ops[0].estadoOperacion ?? "").toUpperCase() === "CANCELADA";
      // También quien tiene una sola: su cuota y sus cuotas pagadas no llegan.
      return {
        operaciones: ops.length,
        vigentes: vigentes.length,
        laPrimeraEsCanceladaYHayVigente: primeraCancelada && vigentes.length > 0,
        saldoVigente: Math.round(vigentes.reduce((s, o) => s + (Number(o.saldoCapital) || 0), 0)),
        cuotaVigente: Math.round(vigentes.reduce((s, o) => s + (Number(o.cuotaNova) || 0), 0)),
      };
    },
  },
  {
    id: "colateral-de-vehiculos-sobre-el-precio-promedio",
    capa: "estructura",
    tipo: "confirmar",
    titulo: "El colateral de los vehículos (el precio más alto de cada uno) pasa en más de 25% al precio promedio de mercado",
    caso: "4 de 4 casos del piloto del 2026-11-06 con el precio más alto o el avalúo, entre 25% y 60% sobre el promedio (p10)",
    aplica: ({ perfil }) => (perfil?.patrimonio?.numeroVehiculos ?? 0) > 0,
    detectar: ({ raw, perfil }) => {
      const vehiculos = raw.vehiculos?.data?.personaVehiculo ?? [];
      // La referencia es el precio promedio de mercado; sin él, el avalúo, que
      // es lo único que hay.
      const referencia = vehiculos.reduce((s, v) => s + (Number(v.precioPromedio) > 0 ? Number(v.precioPromedio) : Number(v.valorAvaluo) || 0), 0);
      const colateral = perfil.patrimonio.valorColateralVehiculos ?? 0;
      if (!(referencia > 0) || colateral <= referencia * 1.25) return null;
      const deDonde = vehiculos.map((v) => {
        const campos = ["valorAvaluo", "precioPromedio", "precioMinimo", "precioMaximo", "precioComercial", "precioVentaPublico", "precioVentaPromedio"];
        return campos.reduce((a, c) => ((Number(v[c]) || 0) > (Number(v[a]) || 0) ? c : a), "valorAvaluo");
      });
      return { vehiculos: vehiculos.length, colateral: Math.round(colateral), referencia: Math.round(referencia), razon: Math.round((colateral / referencia) * 100) / 100, campoMasAlto: deDonde };
    },
  },
];

// Los préstamos del IESS/BIESS como los traen las dos fuentes, para medir
// (la regla que los une es operacionesIessBiess, en process.ts). Fechas
// DD/MM/AAAA a días desde 1970.
function diaDDMMAAAA(v) {
  const m = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? Math.floor(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) / 86400000) : null;
}
const sinCeros = (v) => String(v ?? "").trim().replace(/^0+/, "");
function opsDeLaBase(raw) {
  const bi = raw.basesInternas?.data ?? {};
  const q = (bi.tcredQuirografarios ?? []).map((r) => ({
    tipo: "quirografario", numero: sinCeros(r.numeroOperacion), concesion: String(r.fechaConsesion ?? "").trim(), dia: diaDDMMAAAA(r.fechaConsesion),
    fin: diaDDMMAAAA(r.fechaFinCredito), monto: Number(r.montoTransferido) || 0, saldo: Number(r.saldoTotalCredito) || 0,
    diasMora: Number(r.diasMoraAfi) || 0, estado: String(r.estadoOperacion ?? "").toUpperCase(),
  }));
  const h = (bi.tcredHipotecarios ?? []).map((r) => ({
    tipo: "hipotecario", numero: sinCeros(r.srNrooperaciongaf), concesion: String(r.srFecprimerdesembolso ?? "").trim(), dia: diaDDMMAAAA(r.srFecprimerdesembolso),
    fin: diaDDMMAAAA(r.srFecfincredito), monto: Number(r.srMontofinanciado) || 0, saldo: Number(r.srSaldototalcredito) || 0,
    diasMora: Number(r.srDiasmoraafi) || 0, estado: String(r.srEstadocredito ?? "").toUpperCase(),
  }));
  return [...q, ...h];
}
function opsDeLosPrestamos(raw) {
  const de = (fuente, tipo) =>
    (raw[fuente]?.data?.prestamos ?? []).map((r) => ({
      tipo, numero: sinCeros(r.nroOperacion), concesion: String(r.fechaConcesion ?? "").trim(), dia: diaDDMMAAAA(r.fechaConcesion),
      monto: Number(r.valorPrestamo) || 0, saldo: (Number(r.valorPorVencer) || 0) + (Number(r.valorVencido) || 0), estado: String(r.estado ?? ""),
    }));
  return [...de("creditoQuirografario", "quirografario"), ...de("creditoHipotecario", "hipotecario")];
}
const operacionesDeLaInstitucion = (raw) => {
  const v = raw.basesInternas?.data?.personasIncumplimientos;
  return Array.isArray(v) ? v : [];
};

// Los controles que ya existen y miden otras partes de la cadena. La revisión
// los nombra para no duplicarlos (habilidad, «Controles que ya existen»).
export const CONTROLES_EXISTENTES = [
  { guion: "scripts/validar-perfil-del-modelo.mjs", mide: "lo que lee el modelo (14 reglas, sin llamarlo)" },
  { guion: "scripts/detectar-atipicos.mjs", mide: "lo que escribió el modelo contra lo que leyó y el crudo" },
  { guion: "scripts/conciliar-equifax.mjs", mide: "Equifax contra sí mismo (detalle contra resumen)" },
  { guion: "scripts/medir-solapamiento-equifax.mjs", mide: "bancos, cooperativas y comercial entre Equifax y Proveedor_Info_1, por sistema" },
  { guion: "scripts/probar-paridad-variables-de-ingreso.mjs", mide: "las variables del predictor contra el extracto de AWS" },
  { guion: "scripts/estimar-ingresos-en-lote.mjs", mide: "el predictor sobre toda la cartera, sin guardar (mientras no haya estimaciones)" },
  { guion: "scripts/recalcular-grupos.mjs --seco", mide: "si el perfil guardado se reproduce desde el crudo" },
];
