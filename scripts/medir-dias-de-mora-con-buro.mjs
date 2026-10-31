// Las dos marcas de Monitoreo que leen la deuda de bancos y cooperativas
// («Más de 90 días de mora en bancos (D o E)», que hasta la 132 se llamaba
// «Calificación baja en buró (D/E)», y «Mora bancaria o en cooperativas»),
// leídas de Proveedor_Info_1 y del buró de la institución, en las personas que tienen
// una consulta de Equifax. Es la evidencia de
// docs/propuesta-dias-de-mora-con-buro.md: Equifax no trae la calificación A1
// a E, y la marca pasa a días de mora para quien tiene una consulta vigente.
//
// Se corre ANTES y DESPUÉS de la migración: compara lo que muestra hoy
// resumen_por_persona con lo que dice cada fuente. Antes, el resumen es
// Proveedor_Info_1; después, para quien tiene una consulta vigente, tiene que ser el
// buró.
//
// SOLO LEE. No llama a Equifax ni a Proveedor_Info_1, no cobra y no escribe en la base.
// Imprime CONTEOS: nunca una cédula, un monto ni un código de persona.
//
//   node scripts/medir-dias-de-mora-con-buro.mjs
//
// AVISO: este archivo no pasa por lint ni build. Si cambia la forma del perfil
// (comportamientoBancario, comportamientoCooperativas) o de la estructura de
// Equifax (deudaActualTitular), ajustar acá o mide otra cosa sin avisar.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { raizPrincipal } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const PRINCIPAL = raizPrincipal(RAIZ);

function consultar(sql) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "dias-de-mora-"));
  const archivo = path.join(carpeta, "consulta.sql");
  fs.writeFileSync(archivo, sql);
  try {
    const salida = execSync(`npx --yes supabase@latest db query --linked --workdir "${PRINCIPAL}" --file "${archivo}" -o json`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const j = JSON.parse(salida);
    return Array.isArray(j) ? j : j.rows;
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
}

// Las reglas que se miden, en SQL sobre la estructura de Equifax (126):
// - «D o E» con buró: más de 90 días de mora en bancos como titular. Diners va
//   dentro de bancos en Equifax, como en Proveedor_Info_1 (Super + Diners). En la tabla
//   de la Superintendencia para consumo (110), D empieza a los 91 días.
// - «Mora» con buró: monto en atraso (vencido, no devenga, demanda o castigo)
//   en bancos o cooperativas como titular: la misma definición que con
//   Proveedor_Info_1 (deudaEnAtraso + saldoEnMora de cooperativas).
// La consulta vigente: de producción, con estructura, de la persona, hasta el
// 17 del mes (vigencia-mensual.ts: el ciclo empieza el 18 a las 00:00 de
// Ecuador).
const SQL = `
with eq as (
  select distinct on (ce.client_id) ce.id, ce.client_id, ce.created_at, ce.estructura as e,
         ce.created_at >= (date_trunc('month', (now() at time zone 'America/Guayaquil') - interval '17 days') + interval '17 days') at time zone 'America/Guayaquil' as vigente
    from consultas_equifax ce
   where ce.ambiente = 'produccion' and ce.http_equifax = 200 and ce.estructura is not null and ce.client_id is not null
     and coalesce(ce.estructura #>> '{consulta,identidadVerificada}', '') <> 'false'
   order by ce.client_id, ce.created_at desc, ce.id desc
),
-- Se eligen las personas antes de abrir el perfil: sólo el último de cada una.
nd as materialized (
  select eq.*, r.calificacion_baja as resumen_de, r.tiene_mora as resumen_mora, r.es_sintetico,
         floor(extract(epoch from eq.created_at - r.perfil_at) / 86400) as dias_entre,
         (cp.standard_profile || '{}'::jsonb) as sp
    from eq join resumen_por_persona r on r.client_id = eq.client_id
    join client_profiles cp on cp.id = r.perfil_id
),
x as (
  select vigente, es_sintetico, dias_entre, resumen_de, resumen_mora,
    sp -> 'comportamientoBancario' ->> 'peorCalificacionRiesgo' as calif,
    coalesce(sp -> 'comportamientoBancario' ->> 'peorCalificacionRiesgo' in ('D', 'E'), false) as nd_de,
    coalesce((sp -> 'comportamientoBancario' ->> 'deudaEnAtraso')::numeric, (sp -> 'comportamientoBancario' ->> 'saldoEnMoraBuroCredito')::numeric, 0) > 0
      or coalesce((sp -> 'comportamientoCooperativas' ->> 'saldoEnMora')::numeric, 0) > 0 as nd_mora,
    (sp -> 'comportamientoCooperativas' ->> 'diasMoraMaxima')::numeric as nd_dias_coop,
    (e #>> '{deudaActualTitular,bancos,maximoDiasDeMora}')::numeric as eq_dias_bancos,
    (e #>> '{deudaActualTitular,cooperativas,maximoDiasDeMora}')::numeric as eq_dias_coop,
    jsonb_typeof(e #> '{deudaActualTitular,bancos}') is distinct from 'object' as eq_bancos_no_medido,
    (select bool_or(coalesce((e #>> array['deudaActualTitular', s, c])::numeric, 0) > 0)
       from unnest(array['bancos', 'cooperativas']) s,
            unnest(array['saldoVencidoUsd', 'saldoNoDevengaInteresesUsd', 'saldoDemandaJudicialUsd', 'saldoCarteraCastigadaUsd']) c) as eq_mora
  from nd
),
t as (
  select x.*,
    coalesce(eq_dias_bancos, 0) > 90 as eq_de,
    (select k.categoria from lab_tablas_calificacion k
      where k.version = 1 and k.sistema = 'bancos' and coalesce(x.eq_dias_bancos, 0) between k.dias_desde and coalesce(k.dias_hasta, 1000000)) as eq_categoria,
    case when calif = 'A1' then 1 when calif in ('A2', 'A3', 'B1') then 2 when calif in ('B2', 'C1', 'C2') then 3 when calif in ('D', 'E') then 4 end as nd_tramo,
    case when coalesce(eq_dias_bancos, 0) = 0 then 1 when eq_dias_bancos <= 30 then 2 when eq_dias_bancos <= 90 then 3 else 4 end as eq_tramo
  from x
),
cartera as (
  select r.calificacion_baja, r.tiene_mora, r.perfil_id
    from resumen_por_persona r where r.perfil_id is not null and not r.es_sintetico
)
select 'personas' as grupo, 'con consulta de Equifax' as que, count(*) as n from t
union all select 'personas', 'con consulta vigente hoy', count(*) filter (where vigente) from t
union all select 'personas', 'sintéticas', count(*) filter (where es_sintetico) from t
union all select 'personas', 'bancos no medido en Equifax', count(*) filter (where eq_bancos_no_medido) from t
union all select 'personas', 'perfil de Proveedor_Info_1 0 a 7 días antes de Equifax', count(*) filter (where dias_entre between 0 and 7) from t
union all select 'personas', 'perfil de Proveedor_Info_1 8 a 14 días antes', count(*) filter (where dias_entre between 8 and 14) from t
union all select 'personas', 'perfil de Proveedor_Info_1 15 a 30 días antes', count(*) filter (where dias_entre between 15 and 30) from t
union all select 'personas', 'perfil de Proveedor_Info_1 más de 30 días antes', count(*) filter (where dias_entre > 30) from t
union all select 'personas', 'perfil de Proveedor_Info_1 posterior a Equifax', count(*) filter (where dias_entre < 0) from t
union all select 'D o E', 'Proveedor_Info_1: calificación D o E', count(*) filter (where nd_de) from t
union all select 'D o E', 'Equifax: más de 90 días en bancos', count(*) filter (where eq_de) from t
union all select 'D o E', 'las dos', count(*) filter (where nd_de and eq_de) from t
union all select 'D o E', 'sólo Proveedor_Info_1', count(*) filter (where nd_de and not eq_de) from t
union all select 'D o E', 'sólo Equifax', count(*) filter (where not nd_de and eq_de) from t
union all select 'D o E', 'Monitoreo hoy (resumen_por_persona)', count(*) filter (where resumen_de) from t
union all select 'D o E', 'Monitoreo distinto de Equifax en las vigentes', count(*) filter (where vigente and resumen_de is distinct from eq_de) from t
union all select 'D o E', 'Monitoreo distinto de Proveedor_Info_1', count(*) filter (where resumen_de is distinct from nd_de) from t
union all select 'D o E', 'Equifax: más de 90 días en cooperativas', count(*) filter (where eq_dias_coop > 90) from t
union all select 'D o E', 'Proveedor_Info_1: más de 90 días en cooperativas', count(*) filter (where nd_dias_coop > 90) from t
union all select 'D o E', 'más de 90 días en cooperativas sin D o E (Equifax)', count(*) filter (where eq_dias_coop > 90 and not eq_de) from t
union all select 'calificación', 'misma categoría exacta (días de Equifax en la tabla 1)', count(*) filter (where calif = eq_categoria) from t
union all select 'calificación', 'mismo tramo: al día / 1-30 / 31-90 / más de 90', count(*) filter (where nd_tramo = eq_tramo) from t
union all select 'calificación', 'Proveedor_Info_1 en un tramo peor', count(*) filter (where nd_tramo > eq_tramo) from t
union all select 'calificación', 'Proveedor_Info_1 en un tramo mejor', count(*) filter (where nd_tramo < eq_tramo) from t
union all select 'mora', 'Proveedor_Info_1: monto en atraso en bancos o cooperativas', count(*) filter (where nd_mora) from t
union all select 'mora', 'Equifax: monto en atraso en bancos o cooperativas', count(*) filter (where eq_mora) from t
union all select 'mora', 'las dos', count(*) filter (where nd_mora and eq_mora) from t
union all select 'mora', 'sólo Proveedor_Info_1', count(*) filter (where nd_mora and not eq_mora) from t
union all select 'mora', 'sólo Equifax', count(*) filter (where not nd_mora and eq_mora) from t
union all select 'mora', 'Equifax: días de mora sin monto en atraso', count(*) filter (where not eq_mora and (coalesce(eq_dias_bancos, 0) > 0 or coalesce(eq_dias_coop, 0) > 0)) from t
union all select 'mora', 'Equifax: días de mora sin monto, de más de 30 días', count(*) filter (where not eq_mora and (coalesce(eq_dias_bancos, 0) > 30 or coalesce(eq_dias_coop, 0) > 30)) from t
union all select 'mora', 'Monitoreo hoy (resumen_por_persona)', count(*) filter (where resumen_mora) from t
union all select 'mora', 'Monitoreo distinto de Equifax en las vigentes', count(*) filter (where vigente and resumen_mora is distinct from eq_mora) from t
union all select 'mora', 'Monitoreo distinto de Proveedor_Info_1', count(*) filter (where resumen_mora is distinct from nd_mora) from t
union all select 'cartera', 'personas reales con perfil', count(*) from cartera
union all select 'cartera', 'Monitoreo: D o E', count(*) filter (where calificacion_baja) from cartera
union all select 'cartera', 'Monitoreo: mora bancaria o en cooperativas', count(*) filter (where tiene_mora) from cartera
`;

const filas = consultar(SQL);
let grupo = null;
for (const f of filas) {
  if (f.grupo !== grupo) {
    grupo = f.grupo;
    console.log(`\n${grupo}`);
  }
  console.log(`  ${String(f.que).padEnd(62)} ${String(f.n).padStart(5)}`);
}
