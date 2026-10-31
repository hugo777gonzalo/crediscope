// Cuánto se repiten Equifax y el buró de Proveedor_Info_1 en las personas que tienen
// las dos: deuda, atraso, calificación contra días de mora, operaciones, cuota,
// codeudor o garante y préstamos del IESS/BIESS, por sistema (bancos,
// cooperativas, comercial). Es la evidencia de
// docs/propuesta-buro-de-la-institucion.md, sección 1: antes de dejar de leer
// (o de consultar) en Proveedor_Info_1 lo que trae el buró de la institución, hay que
// saber qué tema cubren las dos y cuánto coinciden.
//
// Compara cada consulta de Equifax (tablas equifax_*, 126) con el ÚLTIMO perfil
// de Proveedor_Info_1 de esa persona (standard_profile). El sector comercial se compara
// además por empresa contra el retail del crudo local de Proveedor_Info_1
// (research/proveedor-info-1-raw-2026-10-03/, la reconsulta de ese día): la pregunta es
// si son las mismas empresas, no los mismos montos.
//
// SOLO LEE. No llama a Equifax ni a Proveedor_Info_1, no cobra y no escribe en la base.
// Imprime CONTEOS y nombres de empresas acreedoras: nunca una cédula, un monto
// ni un código de persona. Las cédulas quedan en memoria.
//
//   node scripts/medir-solapamiento-equifax.mjs
//
// AVISO: este archivo no pasa por lint ni build. Si cambia la forma del perfil
// (comportamientoBancario, comportamientoCooperativas) o de las tablas de
// Equifax, ajustar acá o mide otra cosa sin avisar.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { raizPrincipal } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const PRINCIPAL = raizPrincipal(RAIZ);

function consultar(sql) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "solapamiento-"));
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

// Un monto "igual" es hasta el 1% de diferencia; "cerca", hasta el 10%. El
// perfil de Proveedor_Info_1 es de hasta 30 días antes que la consulta de Equifax, así
// que parte de cada diferencia puede ser tiempo y no fuente.
const SQL_TEMAS = `
with c as (
  select ce.id, coalesce(ce.client_id, cl.id) as client_id, ce.created_at, ce.ambiente, ce.estructura
  from consultas_equifax ce
  left join clients cl on ce.client_id is null and cl.cedula = ce.identificacion
),
p as materialized (
  select distinct on (c.id) c.id as cid, c.created_at as eq_el, c.ambiente, c.estructura,
         cp.created_at as nv_el, cp.standard_profile as sp
  from c join client_profiles cp on cp.client_id = c.client_id
  order by c.id, cp.created_at desc
),
m as (
  select cid, eq_el, nv_el, ambiente, estructura,
         sp->'metaConsulta' as meta, sp->'comportamientoBancario' as b, sp->'comportamientoCooperativas' as k
  from p
),
medido as (
  select cid, f, (meta->'fuentesConDatos' ? f) as con_datos, (meta->'fuentesSinDatos' ? f) as sin_datos
  from m cross join (values ('buroCreditoSuper'), ('buroCreditoDiners'), ('buroCreditoCoop'), ('retails'),
                            ('creditoHipotecario'), ('creditoQuirografario')) v(f)
),
nv as (
  select cid, 'bancos' as sistema,
         (b->>'numeroOperacionesBuroCredito')::int as ops,
         coalesce((b->>'saldoTotalVigente')::numeric, 0)
           + coalesce((b->>'deudaEnAtraso')::numeric, (b->>'saldoEnMoraBuroCredito')::numeric, 0) as saldo,
         coalesce((b->>'deudaEnAtraso')::numeric, (b->>'saldoEnMoraBuroCredito')::numeric, 0) as atraso,
         (b->>'tieneOperacionConDemanda')::boolean as demanda,
         (b->>'tieneOperacionCastigada')::boolean as castigada,
         null::int as dias,
         b->>'peorCalificacionRiesgo' as calif,
         null::numeric as cuota,
         coalesce((b->>'deudaComoGaranteOCodeudor')::numeric, 0) as saldo_cg,
         (b->>'tieneCreditoIessBiess')::boolean as iess
  from m
  union all
  select cid, 'cooperativas', (k->>'numeroOperaciones')::int, coalesce((k->>'saldoTotal')::numeric, 0),
         coalesce((k->>'saldoEnMora')::numeric, 0), (k->>'tieneOperacionConDemanda')::boolean,
         (k->>'tieneOperacionCastigada')::boolean, (k->>'diasMoraMaxima')::int, null,
         (k->>'cuotaMensualTotal')::numeric, null, null
  from m
  union all
  select cid, 'comercial', (b->>'numeroDeudasRetail')::int, coalesce((b->>'totalDeudaRetail')::numeric, 0),
         coalesce((b->>'valorVencidoRetail')::numeric, 0), null, null, (b->>'diasMoraMaximaRetail')::int,
         null, null, null, null
  from m
),
ef as (
  select o.consulta_equifax_id as cid, o.sistema,
         count(*) filter (where rol = 'titular') as ops,
         coalesce(sum(saldo_deuda_usd) filter (where rol = 'titular'), 0) as saldo,
         coalesce(sum(coalesce(vencido_usd, 0) + coalesce(no_devenga_intereses_usd, 0) + coalesce(demanda_judicial_usd, 0)
                      + coalesce(cartera_castigada_usd, 0)) filter (where rol = 'titular'), 0) as atraso,
         coalesce(bool_or(demanda_judicial_usd > 0) filter (where rol = 'titular'), false) as demanda,
         coalesce(bool_or(cartera_castigada_usd > 0) filter (where rol = 'titular'), false) as castigada,
         max(dias_morosidad) filter (where rol = 'titular') as dias,
         sum(cuota_mensual_usd) filter (where rol = 'titular') as cuota,
         coalesce(sum(saldo_deuda_usd) filter (where rol in ('codeudor', 'garante')), 0) as saldo_cg,
         count(*) filter (where rol = 'titular' and (institucion ilike '%BIESS%' or institucion ilike '%SEGURIDAD SOCIAL%')) as ops_iess
  from equifax_operaciones o
  group by 1, 2
),
j as (
  select n.cid, n.sistema,
         n.ops as n_ops, n.saldo as n_saldo, n.atraso as n_atraso, n.demanda as n_dem, n.castigada as n_cas, n.dias as n_dias,
         n.calif, n.cuota as n_cuota, n.saldo_cg as n_saldo_cg, n.iess as n_iess,
         coalesce(e.ops, 0) as e_ops, coalesce(e.saldo, 0) as e_saldo, coalesce(e.atraso, 0) as e_atraso,
         coalesce(e.demanda, false) as e_dem, coalesce(e.castigada, false) as e_cas, e.dias as e_dias, e.cuota as e_cuota,
         coalesce(e.saldo_cg, 0) as e_saldo_cg, coalesce(e.ops_iess, 0) as e_ops_iess,
         m.estructura->'deudaActualTitular'->n.sistema->>'conciliaConElResumen' as concilia
  from nv n
  join m on m.cid = n.cid
  left join ef e on e.cid = n.cid and e.sistema = n.sistema
),
k as (
  select j.*,
    case when n_saldo = 0 and e_saldo = 0 then '0 ninguna tiene'
         when n_saldo = 0 then '1 sólo Equifax'
         when e_saldo = 0 then '2 sólo Proveedor_Info_1'
         when abs(n_saldo - e_saldo) / greatest(n_saldo, e_saldo) <= 0.01 then '3 igual (hasta 1%)'
         when abs(n_saldo - e_saldo) / greatest(n_saldo, e_saldo) <= 0.10 then '4 cerca (hasta 10%)'
         when abs(n_saldo - e_saldo) / greatest(n_saldo, e_saldo) <= 0.30 then '5 distinta (hasta 30%)'
         else '6 muy distinta (más de 30%)' end as c_saldo,
    case when n_saldo > 0 and e_saldo > 0 and abs(n_saldo - e_saldo) / greatest(n_saldo, e_saldo) > 0.01
         then case when e_saldo > n_saldo then 'Equifax mayor' else 'Proveedor_Info_1 mayor' end end as d_saldo,
    case when n_atraso > 0 and e_atraso > 0 then '3 las dos' when n_atraso > 0 then '2 sólo Proveedor_Info_1'
         when e_atraso > 0 then '1 sólo Equifax' else '0 ninguna' end as c_atraso,
    case when n_atraso > 0 and e_atraso > 0 then
      case when abs(n_atraso - e_atraso) / greatest(n_atraso, e_atraso) <= 0.01 then 'igual (hasta 1%)'
           when abs(n_atraso - e_atraso) / greatest(n_atraso, e_atraso) <= 0.10 then 'cerca (hasta 10%)'
           else 'distinta (más de 10%)' end end as m_atraso,
    case when coalesce(n_ops, 0) = e_ops then 'igual' when e_ops > coalesce(n_ops, 0) then 'Equifax más' else 'Proveedor_Info_1 más' end as c_ops,
    case when e_dias is null then 'sin operaciones' when e_dias = 0 then '0' when e_dias <= 30 then '1 a 30'
         when e_dias <= 90 then '31 a 90' else 'más de 90' end as b_e_dias,
    case when n_dias is null then 'sin operaciones' when n_dias = 0 then '0' when n_dias <= 30 then '1 a 30'
         when n_dias <= 90 then '31 a 90' else 'más de 90' end as b_n_dias
  from j
)
select 'A. tiempo' as tema, '' as sistema, 'perfil de Proveedor_Info_1 respecto de Equifax' as que,
       case when nv_el < eq_el - interval '30 days' then 'más de 30 días antes' when nv_el < eq_el then 'hasta 30 días antes'
            else 'después' end as categoria, count(*) as n
from m group by 1, 2, 3, 4
union all
select 'A. tiempo', '', 'ambiente de la consulta de Equifax', ambiente, count(*) from m group by 1, 2, 3, 4
union all
select 'B. medido', f, 'la fuente de Proveedor_Info_1 contestó', case when con_datos then 'con datos' when sin_datos then 'sin datos' else 'no medida' end, count(*)
from medido group by 1, 2, 3, 4
union all
select 'C. saldo propio', sistema, 'deuda del titular', c_saldo, count(*) from k group by 1, 2, 3, 4
union all
select 'C. saldo propio', sistema, 'cuál es mayor (si difieren más de 1%)', d_saldo, count(*) from k where d_saldo is not null group by 1, 2, 3, 4
union all
select 'D. atraso', sistema, 'hay monto en atraso (titular)', c_atraso, count(*) from k group by 1, 2, 3, 4
union all
select 'D. atraso', sistema, 'monto en atraso, si las dos tienen', m_atraso, count(*) from k where m_atraso is not null group by 1, 2, 3, 4
union all
select 'D. atraso', sistema, 'Equifax: días de mora > 0 con atraso en 0', 'personas', count(*)
from k where e_atraso = 0 and coalesce(e_dias, 0) > 0 group by 1, 2, 3, 4
union all
select 'E. operaciones', sistema, 'número de operaciones del titular', c_ops, count(*) from k group by 1, 2, 3, 4
union all
select 'F. calificación', 'bancos', 'peor calificación de Proveedor_Info_1 × máximo de días de Equifax', coalesce(calif, '(ninguna)') || ' × ' || b_e_dias, count(*)
from k where sistema = 'bancos' group by 1, 2, 3, 4
union all
select 'F. días de mora', sistema, 'días de Proveedor_Info_1 × días de Equifax', b_n_dias || ' × ' || b_e_dias, count(*)
from k where sistema in ('cooperativas', 'comercial') group by 1, 2, 3, 4
union all
select 'G. demanda', sistema, 'operación con demanda judicial',
       case when n_dem and e_dem then 'las dos' when n_dem then 'sólo Proveedor_Info_1' when e_dem then 'sólo Equifax' else 'ninguna' end, count(*)
from k where sistema in ('bancos', 'cooperativas') group by 1, 2, 3, 4
union all
select 'G. castigada', sistema, 'cartera castigada',
       case when n_cas and e_cas then 'las dos' when n_cas then 'sólo Proveedor_Info_1' when e_cas then 'sólo Equifax' else 'ninguna' end, count(*)
from k where sistema in ('bancos', 'cooperativas') group by 1, 2, 3, 4
union all
select 'H. cuota', 'cooperativas', 'cuota mensual del titular',
       case when coalesce(n_cuota, 0) = 0 and coalesce(e_cuota, 0) = 0 then '0 ninguna'
            when coalesce(n_cuota, 0) = 0 then '1 sólo Equifax' when coalesce(e_cuota, 0) = 0 then '2 sólo Proveedor_Info_1'
            when abs(n_cuota - e_cuota) / greatest(n_cuota, e_cuota) <= 0.01 then '3 igual (hasta 1%)'
            when abs(n_cuota - e_cuota) / greatest(n_cuota, e_cuota) <= 0.10 then '4 cerca (hasta 10%)'
            else '5 distinta (más de 10%)' end, count(*)
from k where sistema = 'cooperativas' group by 1, 2, 3, 4
union all
select 'H. cuota', sistema, 'Equifax trae cuota del titular (> 0)', case when coalesce(e_cuota, 0) > 0 then 'sí' else 'no' end, count(*)
from k where sistema in ('bancos', 'comercial') group by 1, 2, 3, 4
union all
select 'I. codeudor o garante', 'bancos', 'deuda como codeudor o garante',
       case when n_saldo_cg = 0 and e_saldo_cg = 0 then '0 ninguna' when n_saldo_cg = 0 then '1 sólo Equifax' when e_saldo_cg = 0 then '2 sólo Proveedor_Info_1'
            when abs(n_saldo_cg - e_saldo_cg) / greatest(n_saldo_cg, e_saldo_cg) <= 0.01 then '3 igual (hasta 1%)'
            when abs(n_saldo_cg - e_saldo_cg) / greatest(n_saldo_cg, e_saldo_cg) <= 0.10 then '4 cerca (hasta 10%)'
            else '5 distinta (más de 10%)' end, count(*)
from k where sistema = 'bancos' group by 1, 2, 3, 4
union all
select 'I. codeudor o garante', sistema, 'Equifax: deuda como codeudor o garante (Proveedor_Info_1 no la mide aquí)',
       case when e_saldo_cg > 0 then 'tiene' else 'no tiene' end, count(*)
from k where sistema in ('cooperativas', 'comercial') group by 1, 2, 3, 4
union all
select 'J. IESS/BIESS', '', 'préstamo del IESS/BIESS: Proveedor_Info_1 (fuente aparte) × Equifax (operación del BIESS como titular)', cat, count(*)
from (select case when bool_or(n_iess) and sum(e_ops_iess) > 0 then 'las dos' when bool_or(n_iess) then 'sólo Proveedor_Info_1'
                  when sum(e_ops_iess) > 0 then 'sólo Equifax' else 'ninguna' end as cat
      from k group by cid) x
group by 1, 2, 3, 4
union all
select 'K. conciliación', sistema, 'el detalle de Equifax cuadra con su resumen', coalesce(concilia, '(sin dato)'), count(*) from k group by 1, 2, 3, 4
order by 1, 2, 3, 4;
`;

let anterior = "";
for (const f of consultar(SQL_TEMAS)) {
  const encabezado = `${f.tema} | ${f.sistema} | ${f.que}`;
  if (encabezado !== anterior) console.log(`\n${encabezado}`);
  anterior = encabezado;
  console.log(`    ${f.categoria}: ${f.n}`);
}

// ---- 2. El sector comercial de Equifax contra el retail de Proveedor_Info_1, por empresa ----
// Medido el 2026-10-13: el saldo comercial no coincidía en ninguna de las 12
// personas con las dos. La razón no es el monto sino quién presta: Equifax trae
// telefonía y grandes almacenes, Proveedor_Info_1 distribuidoras e importadoras.
const SQL_COMERCIAL = `
select ce.identificacion as ced, o.rol, o.institucion
from consultas_equifax ce left join equifax_operaciones o on o.consulta_equifax_id = ce.id and o.sistema = 'comercial';`;
const filas = consultar(SQL_COMERCIAL);
const cedulas = [...new Set(filas.map((f) => f.ced))];

// Sin tildes, sin puntuación y sin la forma societaria: "GALAIMPORTACIONES CIA.
// LTDA." y "GALAIMPORTACIONES" son la misma empresa.
const empresa = (s) =>
  String(s ?? "(sin nombre)")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9& ]/g, " ")
    .replace(/\b(SA|S A|CIA|LTDA|CIALTDA|CA|C A|EP)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const sumar = (mapa, clave, ced) => mapa.set(clave, (mapa.get(clave) ?? new Set()).add(ced));

const deEquifax = new Map();
for (const f of filas) if (f.rol === "titular") sumar(deEquifax, empresa(f.institucion), f.ced);

const carpeta = path.join(PRINCIPAL, "research", "proveedor-info-1-raw-2026-10-03");
const deProveedorInfo1 = new Map();
let conCrudo = 0;
for (const ced of cedulas) {
  const archivo = path.join(carpeta, `${ced}.json`);
  if (!fs.existsSync(archivo)) continue;
  conCrudo++;
  const raw = JSON.parse(fs.readFileSync(archivo, "utf8")).raw ?? {};
  // La misma forma que lee process.ts: arr(fuentes, "retails", "retails").
  const sobre = raw.retails?.data ?? raw.retails ?? {};
  const retail = Array.isArray(sobre.retails) ? sobre.retails : [];
  for (const r of retail) sumar(deProveedorInfo1, empresa(r.institucion), ced);
}

console.log(`\nL. comercial por empresa | personas con consulta de Equifax: ${cedulas.length}; con crudo de Proveedor_Info_1 del 03/10: ${conCrudo}`);
const todas = [...new Set([...deEquifax.keys(), ...deProveedorInfo1.keys()])].sort();
const enLasDos = todas.filter((e) => deEquifax.has(e) && deProveedorInfo1.has(e));
console.log(`    empresas: ${todas.length}; en las dos: ${enLasDos.length}; sólo Equifax: ${todas.filter((e) => !deProveedorInfo1.has(e)).length}; sólo Proveedor_Info_1: ${todas.filter((e) => !deEquifax.has(e)).length}`);
console.log("    empresa: personas en Equifax / en Proveedor_Info_1 / en las dos");
for (const e of todas) {
  const a = deEquifax.get(e) ?? new Set();
  const b = deProveedorInfo1.get(e) ?? new Set();
  console.log(`    ${e}: ${a.size} / ${b.size} / ${[...a].filter((c) => b.has(c)).length}`);
}
