-- Prueba en seco de la 151 (sólo lectura): qué personas cambiarían de perfil
-- en el resumen con la regla nueva. Es la misma lógica del lateral `p` de la
-- migración, escrita como select. Esperado el 2026-11-17: 2 personas.
-- La cuenta de faltantes va escrita en línea (copia de fuentes_obligatorias_sin_respuesta, 145)
-- porque el rol de lectura de la CLI no puede ejecutar esa función.
-- Correr: npx --yes supabase@latest db query --remote --read-only --file <este archivo>
with perfiles as (
  select cp.client_id, cp.id, cp.created_at,
         (select count(*) from unnest(array['general','listaNegra','demandas','listasControl','denuncias','antecedentesPenales','basesInternas','contribuyente','jubilados','afiliacionIssfacCertMedico','afiliacionSiisspol','sriImpuestoRenta','establecimientoActEconomica','empleados','buroCreditoSuper','creditoQuirografario','creditoHipotecario','buroCreditoCoop','buroCreditoDiners','retails','pensionAlimenticiaProveedorInfo1']) f
            where not (coalesce(cp.estado_por_fuente ->> f, '') in ('ok','ok_vacio','deshabilitado')
                       or (cp.estado_por_fuente ->> f = 'faltante' and f in ('antecedentesPenales','sriImpuestoRenta'))))::int as faltan,
         (cp.estado_por_fuente is not null and cp.estado_por_fuente <> '{}'::jsonb
          and coalesce(cp.fuentes_ok, cp.ejes_ok, 0) > 0) as con_detalle
    from client_profiles cp
    join clients c on c.id = cp.client_id and not c.es_sintetico
),
ultimo as (
  select distinct on (client_id) client_id, id, created_at, faltan
    from perfiles order by client_id, created_at desc
),
elegido as (
  select distinct on (u.client_id)
         u.client_id, u.id as id_ultimo, u.faltan as faltan_ultimo,
         p.id as id_elegido, p.faltan as faltan_elegido, p.created_at as fecha_elegido
    from ultimo u
    join perfiles p on p.client_id = u.client_id
     and (p.id = u.id
          or (p.created_at < u.created_at
              and p.created_at >= u.created_at - interval '7 days'
              and p.con_detalle and p.faltan < u.faltan))
   order by u.client_id, (p.id = u.id), p.faltan, p.created_at desc
)
select 'c-' || left(client_id::text, 8) as caso,
       faltan_ultimo, faltan_elegido,
       (faltan_elegido = 0) as pasaria_a_completa
  from elegido
 where id_elegido <> id_ultimo
 order by 1;
