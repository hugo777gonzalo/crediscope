// La puerta de la API de CrediScope para instituciones (api/openapi.yaml): lo que
// atiende la función `api-v1`, que es sólo su envoltura. Vive acá para poder
// probar `POST` y `GET` de punta a punta, con el trabajador y el sandbox, sin
// levantar un servidor.
//
// Este es el núcleo de la Fase 1: recibir una evaluación, dejarla en la cola y
// leer su estado y su resultado.
//
//   POST /evaluaciones            pedir la evaluación de una persona (202, o 200
//                                 con `Prefer: wait=N` si termina a tiempo)
//   GET  /evaluaciones/{id}       el estado y, al terminar, el resultado
//   GET  /evaluaciones?referencia= las evaluaciones de la institución con esa referencia
//   GET  /salud                   el estado del servicio, sin ficha
//
// La evaluación la hace avanzar el trabajador (`procesar-evaluaciones`), no esta
// función: acá se valida, se guarda y se contesta enseguida. Los módulos son los
// de la pantalla; la modalidad (`basico`, `pro`, `plus`) decide qué pasos corren,
// y una modalidad nueva es una entrada más en modalidades.ts.
//
// QUIÉN LLAMA. Por ahora, la sesión de un administrador de CrediScope: la API
// está apagada para terceros, y la modalidad Plus consulta al buró y se cobra. La
// ficha OAuth con `private_key_jwt` (D2) reemplaza a esta autenticación sin tocar
// el resto: acá se resuelve un `actor` y nada más depende de cómo se lo identificó.
//
// EL SANDBOX. Con el interruptor encendido (API_SANDBOX=activo) se aceptan las
// identificaciones de prueba de la especificación, que corren con los simuladores
// (sandbox-pasos.ts); apagado, son `identificacion-invalida`. No abre la puerta a
// nadie más: sigue siendo la sesión de un administrador. Cuando llegue OAuth, una
// credencial de sandbox tiene que aceptar SÓLO estas identificaciones: si no, con
// una credencial de prueba se consultaría a una persona de verdad.
//
// Lo que todavía no está (no se promete): la decisión humana
// (`/evaluaciones/{id}/decision`), la cancelación, los avisos, los topes por
// minuto y por día, y los módulos sueltos (`/simulaciones` y
// `/capacidades-de-pago`). Esas rutas contestan 404.

import { cabecerasSinCors } from "./cors.ts";
import { exigirEsquema } from "./version-esquema.ts";
import type { Actor } from "./autorizacion.ts";
import { type CodigoDeProblema, nuevoIdDePedido, respuestaDeProblema } from "./problema.ts";
import { huellaDelPedido, validarPedidoDeLaApi } from "./pedido-de-evaluacion-api.ts";
import { armarEvaluacion, esperaDeLaEvaluacion, VERSION_DE_LA_API } from "./evaluacion-de-la-api.ts";
import { conElPlazoAplicado, esEstadoFinal, estadoDeLaApi, type FilaDeLaCola, idDeLaEvaluacion, plazoDeLaEvaluacion, uuidDeLaEvaluacion } from "./cola-de-evaluaciones.ts";
import { buroDeLaBase } from "./buro-de-la-institucion.ts";
import { MODALIDADES_VERSION, pasosIniciales, type RegistroDePaso } from "./modalidades.ts";
import { esIdentificacionSimulada } from "./identificacion.ts";
import { datosDeLaEvaluacionSimulada } from "./sandbox-pasos.ts";
import { rutaDeLaApi } from "./ruta-de-la-api.ts";

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(promesa: Promise<unknown>): void } | undefined;

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;

const TAMANO_MAXIMO_DEL_CUERPO = 64 * 1024;
const ESPERA_MAXIMA_S = 90;
const SONDEO_MS = 2_000;
// Cuántas evaluaciones de la institución pueden estar en curso a la vez. Es un
// valor de la institución, no de la plataforma: vive en config_operativa.
const TOPE_EN_CURSO_POR_DEFECTO = 50;
// Segundos que se estiman para terminar, según lo que corre cada modalidad
// (Proveedor_Info_1 ~60 s, Equifax unos segundos, el modelo ~25 s; docs de la propuesta, 2.1 a 2.4).
const ESPERA_BASE_S: Record<string, number> = { basico: 90, pro: 95, plus: 105 };

export interface DependenciasDeLaPuerta {
  // Cliente de servicio de supabase-js.
  // deno-lint-ignore no-explicit-any
  db: any;
  /** Quién llama, según el encabezado Authorization. */
  identificar: (autorizacion: string | null) => Promise<Actor | null>;
  despertar: () => Promise<unknown>;
  /** El interruptor del sandbox. Sin decir nada, apagado. */
  sandboxActivo?: boolean;
}

export function crearPuertaDeLaApi({ db, identificar, despertar, sandboxActivo = false }: DependenciasDeLaPuerta): (req: Request) => Promise<Response> {
  async function configNumero(clave: string, porDefecto: number): Promise<number> {
    const { data } = await db.from("config_operativa").select("valor").eq("clave", clave).maybeSingle();
    const n = Number(data?.valor);
    return Number.isFinite(n) && n > 0 ? n : porDefecto;
  }

  // La evaluación completa a partir de su fila: el análisis y el perfil se leen
  // sólo si la evaluación terminó (en curso no hay resultado que armar).
  async function cargarEvaluacion(guardada: Fila): Promise<Fila> {
    // Si el plazo pasó hace rato y el trabajador no la cerró (no corre, o la clave de
    // la agenda está mal), no se entrega «en proceso» para siempre. Sólo la vista.
    const s = conElPlazoAplicado(guardada as unknown as FilaDeLaCola) as unknown as Fila;
    const fila = s as unknown as FilaDeLaCola;
    // Una simulada no dejó nada en las tablas de las personas: sale de sus simuladores.
    if (esIdentificacionSimulada(s.identificacion)) return armarEvaluacion(datosDeLaEvaluacionSimulada(s));
    let analisis: Fila | null = null;
    let perfil: Fila | null = null;
    if (esEstadoFinal(estadoDeLaApi(fila))) {
      if (s.analysis_result_id) {
        const { data } = await db.from("analysis_results").select("*").eq("id", s.analysis_result_id).maybeSingle();
        analisis = data ?? null;
      }
      if (s.client_profile_id) {
        // No se trae el perfil entero: de él sólo hacen falta qué temas se consultaron y la versión de las fuentes de ingreso.
        const { data } = await db
          .from("client_profiles")
          .select("created_at, structure_version, control_bloqueo, estado_por_fuente, metaConsulta:standard_profile->metaConsulta, fuentesVersion:standard_profile->fuentesIngreso->version")
          .eq("id", s.client_profile_id)
          .maybeSingle();
        if (data) {
          perfil = {
            created_at: data.created_at,
            structure_version: data.structure_version,
            control_bloqueo: data.control_bloqueo,
            estado_por_fuente: data.estado_por_fuente,
            standard_profile: { metaConsulta: data.metaConsulta, fuentesIngreso: { version: data.fuentesVersion } },
          };
        }
      }
    }
    return armarEvaluacion({ solicitud: s, analisis, perfil, conBuro: Boolean(s.consulta_equifax_id) });
  }

  return async (req: Request): Promise<Response> => {
    const idPedido = nuevoIdDePedido();
    const base = { ...cabecerasSinCors(), "x-request-id": idPedido };
    const problema = (codigo: CodigoDeProblema, detalle?: string, errores?: Parameters<typeof respuestaDeProblema>[4], extra: Record<string, string> = {}) =>
      respuestaDeProblema(codigo, idPedido, { ...base, ...extra }, detalle, errores);
    const json = (cuerpo: unknown, status: number, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify(cuerpo), { status, headers: { ...base, "content-type": "application/json", ...extra } });

    // El corredor de despliegue confirma el sello preguntando con OPTIONS.
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: base });

    const pathname = new URL(req.url).pathname;
    const ruta = rutaDeLaApi(pathname);
    // Donde está la API en esta dirección (`/functions/v1/api-v1` en Supabase; vacío con un
    // dominio propio): los Location se arman contra eso y no contra un `/v1` que, con la
    // dirección de las funciones de hoy, apuntaría a una ruta que no existe.
    const prefijo = pathname.includes("/api-v1") ? pathname.slice(0, pathname.indexOf("/api-v1") + "/api-v1".length) : "";
    const direccionDe = (uuid: string) => `${prefijo}/evaluaciones/${idDeLaEvaluacion(uuid)}`;

    // El estado del servicio no pide ficha ni devuelve datos de personas.
    if (req.method === "GET" && ruta === "/salud") {
      const sinEsquema = await exigirEsquema(db, base);
      return sinEsquema
        ? json({ estado: "no_disponible", version: VERSION_DE_LA_API }, 503, { "Retry-After": "60" })
        : json({ estado: "operativo", version: VERSION_DE_LA_API }, 200);
    }

    // Quién llama, ANTES de mirar qué pide (CLAUDE.md, regla 6): el portón de
    // Supabase deja pasar la clave pública, que va en la página.
    const actor: Actor | null = await identificar(req.headers.get("Authorization"));
    if (!actor) return problema("no-autenticado", "Falta la ficha de acceso o no es válida.", undefined, { "WWW-Authenticate": 'Bearer error="invalid_token"' });
    // Plus puede consultar el buró y eso se cobra; hasta que la API tenga sus
    // propias fichas con alcance por operación, sólo un administrador la usa.
    if (actor.rol !== "admin") return problema("sin-permiso", "En esta etapa la API la usa sólo un administrador de CrediScope.");

    const sinEsquema = await exigirEsquema(db, base);
    // El mensaje de la guarda habla de migraciones: no sale de acá.
    if (sinEsquema) return problema("servicio-no-disponible", "El servicio no está listo para recibir evaluaciones.", undefined, { "Retry-After": "60" });

    try {
      if (ruta === "/evaluaciones" && req.method === "POST") return await crear(req, actor);
      if (ruta === "/evaluaciones" && req.method === "GET") return await buscar(new URL(req.url).searchParams.get("referencia"));
      const m = /^\/evaluaciones\/([^/]+)$/.exec(ruta);
      if (m && req.method === "GET") return await leer(m[1]);
      return problema("no-encontrada", "Esa operación no existe o todavía no está disponible en esta versión de la API.");
    } catch (err) {
      // Sin el mensaje: el de la base o el de un tercero puede traer datos.
      console.error("api-v1:", (err as Error)?.name);
      return problema("error-interno", "Algo falló de nuestro lado. Citá el idPedido al pedir soporte.");
    }

    // ------------------------------------------------------------------

    async function respuestaDeLaEvaluacion(s: Fila, extra: Record<string, string> = {}, estadoHttpFinal = 200): Promise<Response> {
      const evaluacion = await cargarEvaluacion(s);
      const enCurso = !esEstadoFinal(evaluacion.estado);
      return json(evaluacion, enCurso ? 200 : estadoHttpFinal, {
        "Content-Location": direccionDe(s.id),
        ...(enCurso ? { "Retry-After": String(esperaDeLaEvaluacion(s)) } : {}),
        ...extra,
      });
    }

    function aceptada(s: Fila, enCurso: number, extra: Record<string, string> = {}): Response {
      const id = idDeLaEvaluacion(s.id);
      const espera = (ESPERA_BASE_S[s.modalidad] ?? 90) + Math.floor(enCurso / 8) * 60;
      return json(
        { id, estado: estadoDeLaApi(s as unknown as FilaDeLaCola), referencia: s.referencia, recibidaEl: new Date(s.creada_el).toISOString(), esperaEstimadaSegundos: espera },
        202,
        { Location: direccionDe(s.id), "Retry-After": String(esperaDeLaEvaluacion(s)), ...extra },
      );
    }

    async function leer(idPublico: string): Promise<Response> {
      const uuid = uuidDeLaEvaluacion(idPublico);
      // Un id mal formado y uno que no existe responden igual: no se revela nada.
      if (!uuid) return problema("no-encontrada");
      const { data: s } = await db.from("solicitudes").select("*").eq("id", uuid).eq("origen", "api").maybeSingle();
      if (!s) return problema("no-encontrada");
      return await respuestaDeLaEvaluacion(s);
    }

    async function buscar(referencia: string | null): Promise<Response> {
      if (!referencia || referencia.length > 64 || !/^[A-Za-z0-9._/-]+$/.test(referencia)) {
        return problema("cuerpo-invalido", "Falta la referencia o no tiene el formato de la especificación.", [{ campo: "referencia", motivo: "La referencia tiene de 1 a 64 caracteres: letras, números y . _ / -" }]);
      }
      const { data: filas } = await db.from("solicitudes").select("*").eq("origen", "api").eq("referencia", referencia).order("creada_el", { ascending: false }).limit(20);
      const evaluaciones = await Promise.all((filas ?? []).map(cargarEvaluacion));
      return json({ evaluaciones }, 200);
    }

    async function crear(req: Request, actor: Actor): Promise<Response> {
      const claveDeIdempotencia = req.headers.get("Idempotency-Key") ?? "";
      if (claveDeIdempotencia.length < 8 || claveDeIdempotencia.length > 255) {
        return problema("falta-clave-de-idempotencia", "Todo POST lleva el encabezado Idempotency-Key (de 8 a 255 caracteres, por ejemplo un UUID).");
      }
      if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
        return problema("tipo-no-soportado", "El cuerpo va como application/json.");
      }
      const texto = await req.text();
      if (new TextEncoder().encode(texto).length > TAMANO_MAXIMO_DEL_CUERPO) return problema("cuerpo-demasiado-grande", "El cuerpo pasa de 64 KB.");
      let cuerpo: unknown;
      try {
        cuerpo = JSON.parse(texto);
      } catch {
        return problema("cuerpo-invalido", "El cuerpo no es JSON.");
      }

      const validado = validarPedidoDeLaApi(cuerpo, new Date(), { sandbox: sandboxActivo });
      if (!validado.ok) return problema(validado.codigo, validado.detalle, validado.errores);
      const { modalidad, condiciones, ingresoDeclarado, datos, identificacion, recibirPerfil: _recibirPerfil } = validado.pedido;
      const simulada = esIdentificacionSimulada(identificacion);

      // Repetir un pedido con la misma clave devuelve la misma evaluación y no
      // vuelve a consultar ni a cobrar; con otro cuerpo es un error de la
      // institución.
      const huella = await huellaDelPedido(cuerpo);
      const previa = await buscarPorClave(claveDeIdempotencia);
      if (previa) return previa.huella_del_pedido === huella ? await repetida(previa) : problema("clave-reutilizada", "Esa clave de idempotencia ya se usó con un pedido distinto.");

      // Una simulada no consulta a ningún buró: su respuesta no depende de cuál tenga la base.
      if (modalidad === "plus" && !simulada && (await buroDeLaBase(db)) !== "equifax") {
        return problema("cuerpo-invalido", "La modalidad plus usa Equifax y el buró de esta institución no es Equifax.", [{ campo: "/modalidad", motivo: "El buró de la institución no es Equifax." }]);
      }

      // Reemplazar es pedir de nuevo el análisis de la misma persona: reutiliza su
      // perfil y no vuelve a consultar las fuentes. Un id que no existe y el de otra
      // persona se rechazan igual, para no confirmar que existe.
      let pasos: RegistroDePaso[] = pasosIniciales(modalidad);
      let heredado: Fila = {};
      let resultado: Fila = { version: MODALIDADES_VERSION };
      if (datos.reemplazaA) {
        const { data: anterior } = await db.from("solicitudes").select("identificacion, client_id, client_profile_id").eq("id", datos.reemplazaA).eq("origen", "api").maybeSingle();
        if (!anterior || anterior.identificacion !== identificacion) {
          return problema("cuerpo-invalido", "reemplazaA no es una evaluación de la misma persona.", [{ campo: "/reemplazaA", motivo: "Tiene que ser una evaluación de la misma persona." }]);
        }
        if (anterior.client_profile_id) {
          heredado = { client_id: anterior.client_id, client_profile_id: anterior.client_profile_id };
          pasos = pasos.map((p) => (p.paso === "perfil" ? { paso: "perfil", estado: "hecho", el: new Date().toISOString(), detalle: "Se reutilizó el perfil de la evaluación que ésta reemplaza." } : p));
          resultado = { ...resultado, perfil: { perfilId: anterior.client_profile_id, reutilizado: true } };
        }
      }

      // Tope de evaluaciones en curso de la institución.
      const { count } = await db.from("solicitudes").select("id", { count: "exact", head: true }).eq("origen", "api").eq("estado", "en_evaluacion");
      const enCurso = count ?? 0;
      if (enCurso >= (await configNumero("api_tope_en_curso", TOPE_EN_CURSO_POR_DEFECTO))) {
        return problema("limite-de-velocidad", "Hay demasiadas evaluaciones en curso. Reintentá en unos minutos.", undefined, { "Retry-After": "30" });
      }

      const { data: cliente } = await db.from("clients").select("id").eq("cedula", identificacion).maybeSingle();
      const ahora = new Date();
      const sc = (cuerpo as Fila).solicitudDeCredito as Fila | undefined;
      const { data: creada, error } = await db
        .from("solicitudes")
        .insert({
          origen: "api",
          identificacion,
          client_id: heredado.client_id ?? cliente?.id ?? null,
          client_profile_id: heredado.client_profile_id ?? null,
          creada_por: actor.id,
          modalidad,
          producto: sc?.producto ?? "consumo",
          // Pro y Plus guardan las condiciones ya validadas; Básico, lo que llegó.
          monto: condiciones?.monto ?? sc?.monto ?? null,
          plazo_meses: condiciones?.plazoMeses ?? sc?.plazoMeses ?? null,
          tasa_nominal_anual: condiciones?.tasaNominalAnualPorcentaje ?? sc?.tasaNominalAnualPorcentaje ?? null,
          sistema: condiciones?.sistema ?? sc?.sistema ?? null,
          desgravamen: condiciones?.desgravamen ?? sc?.desgravamen ?? null,
          ingreso_declarado: ingresoDeclarado,
          destino: sc?.destino ?? null,
          garantia: sc?.garantia ?? null,
          autorizacion_id: datos.autorizacion?.id ?? null,
          autorizacion_otorgada_el: datos.autorizacion?.otorgadaEl ?? null,
          autorizacion_vigente_hasta: datos.autorizacion?.vigenteHasta ?? null,
          autorizacion_canal: datos.autorizacion?.canal ?? null,
          autorizacion_finalidad: datos.autorizacion?.finalidad ?? null,
          autorizacion_huella: datos.autorizacion?.huellaDelDocumento ?? null,
          referencia: datos.referencia,
          operador_id: datos.operador?.id ?? null,
          operador_agencia: datos.operador?.agencia ?? null,
          prioridad: datos.prioridad ?? "interactiva",
          reemplaza_a: datos.reemplazaA,
          clave_idempotencia: claveDeIdempotencia,
          huella_del_pedido: huella,
          plazo_hasta: plazoDeLaEvaluacion(datos.prioridad, ahora).toISOString(),
          pasos,
          resultado,
        })
        .select("*")
        .single();

      if (error?.code === "23505") {
        // Dos pedidos iguales a la vez: gana el primero y el segundo recibe la misma evaluación.
        const carrera = await buscarPorClave(claveDeIdempotencia);
        if (carrera) return carrera.huella_del_pedido === huella ? await repetida(carrera) : problema("clave-reutilizada", "Esa clave de idempotencia ya se usó con un pedido distinto.");
        // La referencia es única en la base (una base por institución).
        return problema("referencia-reutilizada", "Ya existe una evaluación con esa referencia. Para pedir de nuevo el análisis de la misma, usá reemplazaA.");
      }
      if (error || !creada) throw new Error("no se pudo guardar la evaluación");

      await db.from("audit_log").insert({
        actor: actor.id,
        action: "solicitud.crear",
        client_id: creada.client_id ?? null,
        // El operador y la autorización responden «¿quién vio mis datos y con qué
        // permiso?»; la huella del documento no se copia acá.
        meta: { solicitud_id: creada.id, origen: "api", modalidad, operador_id: datos.operador?.id, autorizacion_id: datos.autorizacion?.id, referencia: datos.referencia, ...(simulada ? { sandbox: true } : {}) },
      });
      // Sin esperar su respuesta: la agenda de la base lo despierta en el peor caso, y la
      // institución no tiene por qué esperar hasta 10 segundos por un aviso interno.
      const aviso = despertar();
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(aviso);

      // `Prefer: wait=N`: esperar hasta N segundos a que termine.
      const espera = /(?:^|[\s,;])wait=(\d{1,3})(?:$|[\s,;])/.exec(req.headers.get("Prefer") ?? "");
      const segundos = espera ? Math.min(Number(espera[1]), ESPERA_MAXIMA_S) : 0;
      if (segundos > 0) {
        const limite = Date.now() + segundos * 1000;
        while (Date.now() < limite) {
          await new Promise((r) => setTimeout(r, Math.min(SONDEO_MS, Math.max(0, limite - Date.now()))));
          const { data: actual } = await db.from("solicitudes").select("*").eq("id", creada.id).maybeSingle();
          if (actual && esEstadoFinal(estadoDeLaApi(actual as unknown as FilaDeLaCola))) {
            return await respuestaDeLaEvaluacion(actual, { Location: direccionDe(actual.id), "Preference-Applied": `wait=${segundos}` });
          }
        }
      }
      return aceptada(creada, enCurso);
    }

    async function buscarPorClave(clave: string): Promise<Fila | null> {
      const { data } = await db.from("solicitudes").select("*").eq("clave_idempotencia", clave).maybeSingle();
      return data ?? null;
    }

    // El mismo pedido otra vez: lo que corresponde a la evaluación hoy, marcado.
    async function repetida(s: Fila): Promise<Response> {
      const marca = { "Idempotent-Replayed": "true" };
      if (esEstadoFinal(estadoDeLaApi(s as unknown as FilaDeLaCola))) return await respuestaDeLaEvaluacion(s, { Location: direccionDe(s.id), ...marca });
      return aceptada(s, 0, marca);
    }
  };
}
