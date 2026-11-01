// Una base en memoria para las pruebas de punta a punta de la API: entiende lo que
// usan la puerta y el trabajador de supabase-js, y anota cada escritura. Sirve para
// afirmar lo que más importa del sandbox: en qué tablas escribió.
//
// `reclamar_evaluaciones` repite la condición de la 139: si cambia allá, cambia acá.
// Los índices únicos de la clave de idempotencia y de la referencia también (135 y
// 139): una evaluación repetida se distingue por el error 23505 de la base.
//
// No es un archivo de pruebas ni lo importa ninguna función.

import { ESQUEMA_MINIMO } from "./version-esquema.ts";

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;
type Condicion = (f: Fila) => boolean;

export interface BaseEnMemoria {
  // deno-lint-ignore no-explicit-any
  from: (tabla: string) => any;
  // deno-lint-ignore no-explicit-any
  rpc: (nombre: string, args?: Fila) => Promise<any>;
  filas: (tabla: string) => Fila[];
  /** Las tablas donde se escribió, sin repetir. */
  tablasEscritas: () => string[];
}

const copia = <T>(v: T): T => structuredClone(v);

export function baseEnMemoria(reloj: () => Date = () => new Date()): BaseEnMemoria {
  const tablas = new Map<string, Fila[]>();
  const escritas = new Set<string>();
  const filasDe = (tabla: string) => {
    if (!tablas.has(tabla)) tablas.set(tabla, []);
    return tablas.get(tabla) as Fila[];
  };

  function violaUnIndiceUnico(tabla: string, nueva: Fila): boolean {
    if (tabla !== "solicitudes") return false;
    return filasDe(tabla).some((f) =>
      (nueva.clave_idempotencia && f.clave_idempotencia === nueva.clave_idempotencia) ||
      (nueva.referencia && !nueva.reemplaza_a && !f.reemplaza_a && f.referencia === nueva.referencia)
    );
  }

  function consulta(tabla: string) {
    const condiciones: Condicion[] = [];
    let accion: "leer" | "insertar" | "actualizar" = "leer";
    let datos: Fila = {};
    let devolver = false;
    let soloConteo = false;
    let unaSola = false;
    let orden: { columna: string; ascendente: boolean } | null = null;
    let tope: number | null = null;

    function ejecutar(): { data: unknown; error: unknown; count?: number } {
      if (accion === "insertar") {
        if (violaUnIndiceUnico(tabla, datos)) return { data: null, error: { code: "23505", message: "ya existe" } };
        const ahora = reloj().toISOString();
        const fila: Fila = tabla === "solicitudes"
          ? { id: crypto.randomUUID(), estado: "en_evaluacion", intentos: 0, creada_el: ahora, actualizada_el: ahora, proximo_intento_el: null, reclamada_hasta: null, terminada_el: null, fallo_codigo: null, decision: null, ...copia(datos) }
          : { id: crypto.randomUUID(), created_at: ahora, ...copia(datos) };
        filasDe(tabla).push(fila);
        escritas.add(tabla);
        return { data: devolver ? (unaSola ? copia(fila) : [copia(fila)]) : null, error: null };
      }

      const elegidas = filasDe(tabla).filter((f) => condiciones.every((c) => c(f)));
      if (accion === "actualizar") {
        for (const f of elegidas) Object.assign(f, copia(datos));
        if (elegidas.length > 0) escritas.add(tabla);
        if (!devolver) return { data: null, error: null };
        return { data: unaSola ? (elegidas[0] ? copia(elegidas[0]) : null) : copia(elegidas), error: null };
      }

      if (soloConteo) return { data: null, error: null, count: elegidas.length };
      const ordenadas = [...elegidas];
      if (orden) {
        const { columna, ascendente } = orden;
        ordenadas.sort((a, b) => (String(a[columna]) < String(b[columna]) ? -1 : 1) * (ascendente ? 1 : -1));
      }
      const salida = tope === null ? ordenadas : ordenadas.slice(0, tope);
      return { data: unaSola ? (salida[0] ? copia(salida[0]) : null) : copia(salida), error: null };
    }

    const q = {
      select(_columnas?: string, opciones?: { count?: string; head?: boolean }) {
        if (accion !== "leer") devolver = true;
        if (opciones?.head) soloConteo = true;
        return q;
      },
      insert(fila: Fila) {
        accion = "insertar";
        datos = fila;
        return q;
      },
      update(cambios: Fila) {
        accion = "actualizar";
        datos = cambios;
        return q;
      },
      eq(columna: string, valor: unknown) {
        condiciones.push((f) => f[columna] === valor);
        return q;
      },
      neq(columna: string, valor: unknown) {
        condiciones.push((f) => f[columna] !== valor);
        return q;
      },
      order(columna: string, opciones?: { ascending?: boolean }) {
        orden = { columna, ascendente: opciones?.ascending !== false };
        return q;
      },
      limit(n: number) {
        tope = n;
        return q;
      },
      maybeSingle() {
        unaSola = true;
        return q;
      },
      single() {
        unaSola = true;
        return q;
      },
      then(resolver: (r: unknown) => unknown, rechazar?: (e: unknown) => unknown) {
        return Promise.resolve().then(ejecutar).then(resolver, rechazar);
      },
    };
    return q;
  }

  function reclamar({ p_max, p_tope_en_vuelo, p_segundos }: Fila): Fila[] {
    const ahora = reloj();
    const yaPaso = (iso: string | null) => iso === null || Date.parse(iso) <= ahora.getTime();
    const solicitudes = filasDe("solicitudes");
    const enCurso = solicitudes.filter((s) => s.origen === "api" && s.estado === "en_evaluacion");
    const cupo = Math.min(p_max, p_tope_en_vuelo - enCurso.filter((s) => !yaPaso(s.reclamada_hasta)).length);
    if (cupo <= 0) return [];
    const elegidas = enCurso
      .filter((s) => yaPaso(s.reclamada_hasta) && yaPaso(s.proximo_intento_el) && s.decision !== "desistido")
      .sort((a, b) => Number(a.prioridad === "diferida") - Number(b.prioridad === "diferida") || String(a.creada_el).localeCompare(String(b.creada_el)))
      .slice(0, cupo);
    for (const s of elegidas) {
      s.reclamada_hasta = new Date(ahora.getTime() + p_segundos * 1000).toISOString();
      s.actualizada_el = ahora.toISOString();
    }
    return copia(elegidas);
  }

  return {
    from: consulta,
    rpc(nombre: string, args: Fila = {}) {
      if (nombre === "version_del_esquema") return Promise.resolve({ data: ESQUEMA_MINIMO, error: null });
      if (nombre === "reclamar_evaluaciones") return Promise.resolve({ data: reclamar(args), error: null });
      return Promise.reject(new Error(`La base en memoria no conoce ${nombre}.`));
    },
    filas: (tabla: string) => copia(filasDe(tabla)),
    tablasEscritas: () => [...escritas].sort(),
  };
}
