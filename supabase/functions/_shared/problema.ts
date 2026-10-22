// Los errores de la API: `application/problem+json` (RFC 9457) con dos campos
// propios, `codigo` e `idPedido` (api/openapi.yaml, `Problema`).
//
// Un error de la API nunca lleva detalles internos: el `detail` lo escribimos
// nosotros y lo que contestó una fuente, el modelo o la base no se copia nunca.
// El `idPedido` es lo que la institución cita al pedir soporte, y es el mismo
// que el encabezado `X-Request-Id`.

import type { ErrorDeCampo } from "./datos-de-la-solicitud.ts";

export type CodigoDeProblema =
  | "cuerpo-invalido"
  | "identificacion-invalida"
  | "falta-clave-de-idempotencia"
  | "no-autenticado"
  | "sin-permiso"
  | "no-encontrada"
  | "clave-reutilizada"
  | "referencia-reutilizada"
  | "estado-no-permite"
  | "cuerpo-demasiado-grande"
  | "tipo-no-soportado"
  | "autorizacion-insuficiente"
  | "limite-de-velocidad"
  | "cuota-agotada"
  | "capacidad-agotada"
  | "servicio-no-disponible"
  | "error-interno";

export const PROBLEMAS: Record<CodigoDeProblema, { status: number; titulo: string }> = {
  "cuerpo-invalido": { status: 400, titulo: "El pedido no cumple la especificación" },
  "identificacion-invalida": { status: 400, titulo: "Identificación inválida" },
  "falta-clave-de-idempotencia": { status: 400, titulo: "Falta la clave de idempotencia" },
  "no-autenticado": { status: 401, titulo: "Ficha no válida" },
  "sin-permiso": { status: 403, titulo: "Sin permiso para esta operación" },
  "no-encontrada": { status: 404, titulo: "No encontrada" },
  "clave-reutilizada": { status: 409, titulo: "La clave de idempotencia ya se usó con otro pedido" },
  "referencia-reutilizada": { status: 409, titulo: "Ya existe una evaluación con esa referencia" },
  "estado-no-permite": { status: 409, titulo: "El estado de la evaluación no permite esta operación" },
  "cuerpo-demasiado-grande": { status: 413, titulo: "El cuerpo es demasiado grande" },
  "tipo-no-soportado": { status: 415, titulo: "Tipo de contenido no soportado" },
  "autorizacion-insuficiente": { status: 422, titulo: "La autorización del titular no alcanza" },
  "limite-de-velocidad": { status: 429, titulo: "Demasiados pedidos" },
  "cuota-agotada": { status: 429, titulo: "Se agotó el tope diario" },
  "capacidad-agotada": { status: 503, titulo: "Sin capacidad para atender a tiempo" },
  "servicio-no-disponible": { status: 503, titulo: "Servicio no disponible" },
  "error-interno": { status: 500, titulo: "Error interno" },
};

// Mientras no se decida el dominio propio (D11) las direcciones son las del
// dominio reservado `.example`, igual que en la especificación.
const BASE_DE_LOS_PROBLEMAS = "https://api.crediscope.example/problemas/";

export function nuevoIdDePedido(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return "ped_" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface CuerpoDeProblema {
  type: string;
  title: string;
  status: number;
  detail?: string;
  codigo: CodigoDeProblema;
  idPedido: string;
  errores?: ErrorDeCampo[];
}

export function cuerpoDeProblema(codigo: CodigoDeProblema, idPedido: string, detalle?: string, errores?: ErrorDeCampo[]): CuerpoDeProblema {
  const { status, titulo } = PROBLEMAS[codigo];
  return {
    type: BASE_DE_LOS_PROBLEMAS + codigo,
    title: titulo,
    status,
    ...(detalle ? { detail: detalle } : {}),
    codigo,
    idPedido,
    ...(errores && errores.length ? { errores } : {}),
  };
}

export function respuestaDeProblema(
  codigo: CodigoDeProblema,
  idPedido: string,
  cabeceras: Record<string, string>,
  detalle?: string,
  errores?: ErrorDeCampo[],
): Response {
  return new Response(JSON.stringify(cuerpoDeProblema(codigo, idPedido, detalle, errores)), {
    status: PROBLEMAS[codigo].status,
    headers: { ...cabeceras, "content-type": "application/problem+json", "x-request-id": idPedido },
  });
}
