# Arma la tabla por persona del predictor de ingresos desde las extracciones de AWS y el SRI de las respuestas de Equifax.
# Una fila por persona (su consulta más reciente), el objetivo es el ingreso no verificado de los independientes y las columnas son solo
# las de los niveles 1 y 2 (especificación 4.1 y 4.2) más unas pocas `med_*` que solo sirven para medir, nunca para entrenar.
# Reemplaza a r2_4_preparar.py y r4_4_sri_preparar.py. Las entradas están fuera de git y llevan identificaciones: la identificación se usa
# en memoria para quedarse con una consulta por persona y no se escribe en la tabla de salida.
#
#   python -I scripts/predictor-ingresos/preparar.py
import sys
import time
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import comun as c


def leer(nombre, texto=False):
    # `ignore_errors` y `sample_size=-1` son los de los guiones viejos: las extracciones traen filas con texto donde va un número.
    return f"read_csv('{(c.ENTRADAS / nombre).as_posix()}.csv', header=true, ignore_errors=true, sample_size=-1{', all_varchar=true' if texto else ''})"


def main():
    t0 = time.time()
    con = duckdb.connect()
    embudo = {}

    # 1) Flujos de ingreso del titular. Lo recuperado de Novadata (el salario del IESS) es lo verificado; el resto, lo no verificado.
    flujos = con.execute(f"""select id_persona_requerimiento,
        sum(case when estado and ingreso>0 then ingreso else 0 end) tot_f,
        sum(case when estado and ingreso>0 and upper(observacion_categoria) like 'RECUPERADO NOVADATA%' then ingreso else 0 end) ver_f,
        max(case when estado and upper(observacion_categoria) like '%PREDICTOR%' then 1 else 0 end) f_pred,
        sum(case when estado then coalesce(monto_banco_principal,0)+coalesce(monto_banco_secundaria,0) else 0 end) m_banco,
        sum(case when estado then coalesce(monto_iva,0)+coalesce(monto_iva_semestral,0) else 0 end) m_iva
        from {leer('ingresos_por_actividad')} where tipo_deudor='TITULAR' group by 1""").df()

    # 2) Cuota de Equifax por consulta. «No tiene deuda» es cero, no dato faltante.
    cuota = con.execute(f"""select try_cast(id_consulta_equifax as bigint) id_consulta_equifax, formato_respuesta fmt,
        case when try_cast(cuota_financiera as double) is not null then try_cast(cuota_financiera as double) when trim(cuota_financiera)='No tiene deuda' then 0 else null end cuota_fin,
        try_cast(cuota_hist_menos_12m as double) h12, try_cast(cuota_hist_menos_6m as double) h6, try_cast(cuota_hist_actual as double) hact
        from {leer('equifax_cuota_por_consulta', True)}""").df()

    # 3) Deuda por tipo de crédito, solo operaciones propias: las filas OTRO/SIN_DATO son totales por sistema y duplicarían.
    deuda = con.execute(f"""with t as (select try_cast(id_consulta_equifax as bigint) id, upper(trim(tipo_credito)) tc, upper(trim(tipo_riesgo)) tr,
            try_cast(n_operaciones as double) n, try_cast(cuota_mensual as double) c, try_cast(saldo_deuda as double) s, try_cast(max_dias_vencido as double) m
        from {leer('equifax_deuda_por_tipo', True)} where not (upper(trim(tipo_credito))='OTRO' and upper(trim(tipo_riesgo))='SIN_DATO'))
        select id id_consulta_equifax,
          sum(c) filter (where tr='TITULAR' and tc='CONSUMO') c_consumo, sum(c) filter (where tr='TITULAR' and tc='TARJETA') c_tarjeta,
          sum(c) filter (where tr='TITULAR' and tc='MICROCREDITO') c_micro, sum(c) filter (where tr='TITULAR' and tc='VIVIENDA') c_vivienda,
          sum(c) filter (where tr='TITULAR' and tc='COMERCIAL') c_comercial, sum(c) filter (where tr='TITULAR' and tc='EDUCATIVO') c_educativo,
          sum(s) filter (where tr='TITULAR' and tc='CONSUMO') s_consumo, sum(s) filter (where tr='TITULAR' and tc='TARJETA') s_tarjeta,
          sum(s) filter (where tr='TITULAR' and tc='MICROCREDITO') s_micro, sum(s) filter (where tr='TITULAR' and tc='VIVIENDA') s_vivienda,
          sum(n) filter (where tr='TITULAR' and tc='CONSUMO') n_consumo, sum(n) filter (where tr='TITULAR' and tc='TARJETA') n_tarjeta,
          sum(n) filter (where tr='TITULAR' and tc='MICROCREDITO') n_micro, sum(n) filter (where tr='TITULAR' and tc='VIVIENDA') n_vivienda,
          sum(c) filter (where tr in ('CODEUDOR','GARANTE')) c_codeudor, max(m) filter (where tr='TITULAR') max_dias_t
        from t group by 1""").df()

    # 4) Consultas de titulares con su solicitud. Del extracto del predictor de Equifax solo se leen las columnas de entrada y las de medir
    #    (la respuesta comercial); `income_predictor_equifax` no se lee: es solo contraste.
    a = con.execute(f"""select id_consulta_equifax, identificacion, id_persona_requerimiento, try_cast(fecha_consulta_equifax as timestamp) t,
        respuesta_comercial med_resp, relacion_dependencia rel,
        edad_a_la_consulta edad, genero, estado_civil, provincia_trabajo prov_trab, canton_trabajo cant_trab, provincia_domicilio prov_dom, canton_domicilio cant_dom,
        iess_salario_total_ultimo_mes aporte, iess_meses_con_aporte meses_aporte, iess_numero_empleos n_empleos,
        saldo_total_reportado saldo, n_operaciones_reportadas n_oper, max_dias_vencido max_mora,
        credito_mayor_aprobado_monto cred_mayor, try_cast(credito_mayor_aprobado_fecha as timestamp) cred_fecha, credito_mayor_12m_monto cred_12m, credito_mayor_24m_monto cred_24m,
        deuda_total_adeudada deuda_total, n_instituciones_con_deuda n_inst, n_creditos_aprobados n_creditos, valor_creditos_aprobados valor_creditos,
        valor_saldos_vigentes saldos_vig, deuda_actual_total deuda_actual, deuda_hace_3_meses deuda_3m
        from {leer('predictor_equifax_por_consulta')} where tipo_deudor='TITULAR' and id_persona_requerimiento is not null and ingreso_validado_total>0""").df()
    embudo["consultas de titulares con solicitud e ingreso validado"] = len(a)
    a = a.merge(cuota, on="id_consulta_equifax", how="left").merge(deuda, on="id_consulta_equifax", how="left").merge(flujos, on="id_persona_requerimiento", how="left")
    # La consulta más reciente de cada persona. El orden por fecha es el que fija las particiones de la validación cruzada: no cambiarlo.
    a = a.sort_values("t").drop_duplicates("identificacion", keep="last").reset_index(drop=True)
    embudo["personas (consulta más reciente)"] = len(a)
    # Un crédito concedido después de la consulta puede ser el que se está pidiendo: no es señal del ingreso (especificación 4.2).
    a.loc[a.cred_fecha > a.t, "cred_mayor"] = np.nan
    a["g6"] = (a.hact / a.h6.where(a.h6 > 0)).clip(0, 20)
    a["g12"] = (a.hact / a.h12.where(a.h12 > 0)).clip(0, 20)
    a["unver"] = (a.tot_f - a.ver_f).clip(lower=0)
    # Solo para medir: la etiqueta «solo cuentas o IVA, sin marca de predictor» de los guiones viejos.
    a["med_cuentas_o_iva_sin_predictor"] = ((a.m_banco + a.m_iva) / a.tot_f.where(a.tot_f > 0) >= 0.99) & (a.f_pred == 0)

    # 5) El SRI de las respuestas JSON de Equifax. Mismas derivaciones que `equifax-tablas.ts`.
    s = pd.read_csv(c.ENTRADAS / "sri_por_consulta.csv", encoding="utf-8-sig", dtype=str)
    s["id_consulta_equifax"] = s.id_consulta_equifax.astype("int64")
    # Las primeras respuestas JSON no traen el bloque: es dato ausente, no «sin RUC». Sin RUC solo si la fuente contestó.
    s["sri_bloque"] = s.tipo_bloque.eq("array")
    s["sri_ruc"] = np.where(s.sri_bloque, s.sri_tiene_ruc.eq("true").astype(float), np.nan)
    s["sri_estado"] = s.sri_estado_contribuyente.str.upper()
    s["sri_clase"] = s.sri_clase_contribuyente.str.upper()
    s["sri_obligado"] = s.sri_obligado.map({"S": 1.0, "N": 0.0})
    fecha = pd.to_datetime(s.fecha_consulta_equifax, errors="coerce")
    inicio = pd.to_datetime(s.sri_fecha_inicio_actividades, errors="coerce")
    suspension = pd.to_datetime(s.sri_fecha_suspension_definitiva, errors="coerce")
    s["sri_antig"] = ((fecha - inicio).dt.days / 365.25).clip(lower=0)
    s["sri_susp"] = ((fecha - suspension).dt.days / 365.25).clip(lower=0)
    codigo = s.sri_codigo_ciiu.fillna("").str.replace(r"[^A-Za-z0-9]", "", regex=True).str.upper().replace("", np.nan)
    s["sri_ciiu_secc"] = codigo.str[0]
    s["sri_ciiu_div"] = codigo.str[:3]
    a = a.merge(s[["id_consulta_equifax", "sri_bloque", "sri_ruc", "sri_estado", "sri_clase", "sri_obligado", "sri_antig", "sri_susp", "sri_ciiu_secc", "sri_ciiu_div"]],
                on="id_consulta_equifax", how="left")
    a["sri_bloque"] = a.sri_bloque.eq(True)

    # 6) La población del predictor: independientes con ingreso no verificado.
    d = a[(a.rel == "INDEPENDIENTE") & (a.unver > 0) & (a.unver < 60000)].reset_index(drop=True)
    embudo["independientes con ingreso no verificado entre 0 y 60.000"] = len(d)
    embudo["  de ellos, con el bloque del SRI (los que entrenan)"] = int(d.sri_bloque.sum())
    embudo["  de ellos, con RUC en el SRI"] = int((d.sri_ruc == 1).sum())
    embudo["  de ellos, OK FACTURAR y condicionado (con bloque)"] = int((d.sri_bloque & d.med_resp.isin(c.OK_FACTURAR)).sum())

    salida = ["id_consulta_equifax", "t", "unver"] + sorted(set(c.NIVELES[2]) - {"anio_mes"}, key=c.NIVELES[2].index) + ["sri_bloque", "med_resp", "med_cuentas_o_iva_sin_predictor"]
    c.verificar_entradas([x for x in salida if not x.startswith("med_") and x not in ("unver", "id_consulta_equifax", "t", "sri_bloque")])
    c.RESULTADOS.mkdir(parents=True, exist_ok=True)
    d[salida].to_parquet(c.TABLA, index=False)

    vacios = {x: round(100 * float(d[x].isna().mean()), 1) for x in salida if x not in ("id_consulta_equifax", "t", "unver", "sri_bloque")}
    c.escribir_json(c.RESULTADOS / "preparar.json", {
        "embudo": embudo,
        "porcentaje_vacio_por_columna": vacios,
        "entradas": {n: {"bytes": (c.ENTRADAS / n).stat().st_size, "sha256": c.huella(c.ENTRADAS / n)} for n in
                     ["ingresos_por_actividad.csv", "equifax_cuota_por_consulta.csv", "equifax_deuda_por_tipo.csv", "predictor_equifax_por_consulta.csv", "sri_por_consulta.csv"]},
        "tabla": {"archivo": c.TABLA.name, "filas": len(d), "sha256": c.huella(c.TABLA)},
        "versiones": c.versiones(),
    })
    for k, v in embudo.items():
        print(f"{v:>8,}".replace(",", ".") + f" {k}")
    print("columnas con más vacíos (%):", dict(sorted(vacios.items(), key=lambda kv: -kv[1])[:8]))
    print(f"listo en {time.time() - t0:.0f} s -> {c.TABLA}")


if __name__ == "__main__":
    main()
