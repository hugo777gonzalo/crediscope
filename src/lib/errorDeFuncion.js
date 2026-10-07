// Una Edge Function que falla manda el motivo en el cuerpo ({ error } desde
// nuestro código; { message } desde la plataforma, por ejemplo con un JWT
// vencido), pero supabase-js lo cambia por "Edge Function returned a non-2xx
// status code". El 2026-10-07 una consulta falló así desde la pantalla y no se
// pudo saber si la fuente no contestó, si la persona no existía o si fue otra
// cosa: el motivo se había perdido. Sin dependencias, para probarlo en Node.
export async function errorDeFuncion(error) {
  const respuesta = error?.context;
  if (respuesta && typeof respuesta.clone === "function") {
    try {
      const cuerpo = await respuesta.clone().json();
      const motivo = cuerpo?.error ?? cuerpo?.message;
      if (typeof motivo === "string" && motivo) {
        const conMotivo = new Error(motivo);
        conMotivo.estado = respuesta.status;
        return conMotivo;
      }
    } catch {
      // El cuerpo no era JSON o ya se leyó: queda el mensaje genérico.
    }
  }
  return error;
}
