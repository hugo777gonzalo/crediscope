// La prueba del grupo de seguridad social (docs/capa-de-hechos.md, 4.5 y 5.2), en etapa A: cada campo de
// `seguridadSocial` tiene su código, cada regla que elige o descarta registros lo dice, una fuente caída
// no se escribe como «no hay», y lo que arman los hechos es lo mismo que arma process.ts. La paridad
// sobre los crudos inventados la corre probar-crudos-sinteticos.mjs.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { derivarHechos } from "../indice.ts";
import { perfilDesdeHechos } from "../perfil-desde-hechos.ts";
import { buildStandardProfile } from "../../process.ts";
import type { Contexto, Hecho } from "../tipos.ts";
import { CATALOGO } from "./seguridad-social.ts";

const CEDULA = "0000000000";
const OTRA = "9999999999";
const contexto: Contexto = { cedula: CEDULA, consulta: "perfil-de-prueba", fechaDeLaConsulta: "2026-10-01T12:00:00-05:00", corteIess: "2026-10", persona: { nombre: null, fechaDeNacimiento: null } };
const ok = (data: unknown) => ({ status: "ok", data });
const faltante = { status: "faltante", data: null };
// Las fuentes del grupo, todas contestando y sin registros; cada prueba reemplaza las suyas.
const BASE = {
  general: ok({ personaNatural: { nombre: "PRUEBA FICTICIO" } }),
  afiliacionIess: ok({ afiliacionIess: [] }),
  pensionista: ok({ pensionista: [] }),
  jubilados: ok({ trabajos: [] }),
  afiliacionSalud: ok({ afiliacionSalud: [] }),
  afiliacionIssfacCertMedico: ok({ afiliaciones: [] }),
  afiliacionIssfacFuerzaArmada: faltante,
  afiliacionSiisspol: ok({ afiliacionSiisspol: [] }),
};
let ultimoCrudo: unknown = null;
function derivar(partes: Record<string, unknown>) {
  ultimoCrudo = { ...BASE, ...partes };
  return derivarHechos(ultimoCrudo, contexto, { estricto: true });
}
const hecho = (doc: ReturnType<typeof derivarHechos>, codigo: string): Hecho => doc.hechos.find((h) => h.codigo === codigo)!;
const perfilDelCrudo = () => buildStandardProfile(ultimoCrudo as never, CEDULA).profile.seguridadSocial;
const descartes = (h: Hecho) => (h.descartados ?? []).map((d) => `${d.registro.fuente}#${d.registro.indice}:${d.motivo}`);

Deno.test("cero campos sin procedencia: todo campo de seguridadSocial tiene su código", () => {
  const texto = Deno.readTextFileSync(new URL("../../types.ts", import.meta.url));
  const desde = texto.indexOf("  seguridadSocial: {");
  const hasta = texto.indexOf("\n  };", desde);
  const campos = [...texto.slice(desde, hasta).matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]).filter((c) => c !== "camposSinDato");
  assertEquals(campos.length, 10);
  const conCodigo = new Set(CATALOGO.flatMap((c) => (c.campoDelPerfil ? [c.campoDelPerfil] : [])));
  assertEquals(campos.filter((c) => !conCodigo.has(`seguridadSocial.${c}`)), []);
});

Deno.test("todo contestó y no hay registros: no afiliado, sin pensión ni jubilación, sin cobertura y ni militar ni policía", () => {
  const doc = derivar({});
  assertEquals(hecho(doc, "ss.iess.afiliado_activo").valor, false);
  assertEquals(hecho(doc, "ss.iess.afiliado_activo").registros.map((r) => `${r.fuente}.${r.lista}`), ["afiliacionIess.afiliacionIess"]);
  assertEquals(hecho(doc, "ss.iess.estado_afiliacion").motivo, "no_aplica");
  assertEquals(hecho(doc, "ss.salud.tiene_cobertura").valor, false);
  assertEquals(hecho(doc, "ss.salud.entidades").valor, []);
  assertEquals(hecho(doc, "ss.militar.titular").valor, false);
  assertEquals(hecho(doc, "ss.militar.titular").registros.map((r) => r.fuente), ["afiliacionIssfacCertMedico", "afiliacionSiisspol"]);
  assertEquals(hecho(doc, "ss.servicio.militar_o_policial").motivo, "no_aplica");
  assertEquals(perfilDesdeHechos(doc, "seguridadSocial"), perfilDelCrudo());
});

Deno.test("afiliación al IESS en faltante: un hueco de esa fuente, null y sin parcial (P60), no «no afiliado»", () => {
  const doc = derivar({ afiliacionIess: faltante });
  const activo = hecho(doc, "ss.iess.afiliado_activo");
  assertEquals([activo.valor, activo.motivo, "parcial" in activo], [null, "fuente_sin_respuesta", false]);
  assertEquals(perfilDesdeHechos(doc, "seguridadSocial").afiliadoIessActivo, null);
  assertEquals(perfilDesdeHechos(doc, "seguridadSocial"), perfilDelCrudo());
});

Deno.test("ss.iess@1: con dos registros de afiliación se lee el primero y el otro se descarta", () => {
  const doc = derivar({ afiliacionIess: ok({ afiliacionIess: [{ estado: "ACTIVO/A" }, { estado: "CESANTE" }] }) });
  const activo = hecho(doc, "ss.iess.afiliado_activo");
  assertEquals(activo.valor, true);
  assertEquals(activo.registros.map((r) => [r.indice, r.campo]), [[0, "estado"]]);
  assertEquals(descartes(activo), ["afiliacionIess#1:se_lee_el_primer_registro_de_afiliacion"]);
  assertEquals(hecho(doc, "ss.iess.estado_afiliacion").valor, "ACTIVO/A");
  assertEquals(perfilDesdeHechos(doc, "seguridadSocial"), perfilDelCrudo());

  const cesante = derivar({ afiliacionIess: ok({ afiliacionIess: [{ estado: "CESANTE" }] }) });
  assertEquals(hecho(cesante, "ss.iess.afiliado_activo").valor, false);
  assertEquals(hecho(cesante, "ss.iess.afiliado_activo").descartados, undefined);
  assertEquals(perfilDesdeHechos(cesante, "seguridadSocial"), perfilDelCrudo());
});

Deno.test("ss.pensionista@1: sólo cuenta el registro con estado verdadero", () => {
  const doc = derivar({ pensionista: ok({ pensionista: [{ estado: false }, { estado: true }] }) });
  const es = hecho(doc, "ss.pensionista.es");
  assertEquals(es.valor, true);
  assertEquals(es.registros.map((r) => r.indice), [1]);
  assertEquals(descartes(es), ["pensionista#0:su_estado_no_es_verdadero"]);
  assertEquals(perfilDesdeHechos(doc, "seguridadSocial"), perfilDelCrudo());

  const ninguna = derivar({ pensionista: ok({ pensionista: [{ estado: false }] }) });
  assertEquals(hecho(ninguna, "ss.pensionista.es").valor, false);
  assertEquals(hecho(ninguna, "ss.pensionista.es").registros.map((r) => r.indice), [0]);
  assertEquals(perfilDesdeHechos(ninguna, "seguridadSocial"), perfilDelCrudo());
});

Deno.test("jubilación caída: sin valor con el parcial, y el perfil de etapa A escribe el parcial como hoy", () => {
  const doc = derivar({ jubilados: { status: "error", data: null } });
  const es = hecho(doc, "ss.jubilado.es");
  assertEquals([es.valor, es.motivo, es.parcial], [null, "fuente_sin_respuesta", false]);
  assertEquals(perfilDesdeHechos(doc, "seguridadSocial"), perfilDelCrudo());
});

Deno.test("ss.salud@1: sólo las entidades que registran cobertura, y el tipo de la primera", () => {
  const doc = derivar({
    afiliacionSalud: ok({
      afiliacionSalud: [
        { entidad: "IESS", registraCobertura: true, tipoSeguro: "seguro general tiempo completo" },
        { entidad: "ISSFA", registraCobertura: false, tipoSeguro: null },
        { entidad: "ISSPOL", registraCobertura: true, tipoSeguro: "otro" },
      ],
    }),
  });
  assertEquals(hecho(doc, "ss.salud.tiene_cobertura").valor, true);
  assertEquals(hecho(doc, "ss.salud.entidades").valor, ["IESS", "ISSPOL"]);
  assertEquals(descartes(hecho(doc, "ss.salud.entidades")), ["afiliacionSalud#1:no_registra_cobertura"]);
  assertEquals(hecho(doc, "ss.salud.tipo_seguro").valor, "seguro general tiempo completo");
  assertEquals(descartes(hecho(doc, "ss.salud.tipo_seguro")), ["afiliacionSalud#1:no_registra_cobertura", "afiliacionSalud#2:se_lee_la_primera_entidad_con_cobertura"]);
  assertEquals(perfilDesdeHechos(doc, "seguridadSocial"), perfilDelCrudo());

  const caida = derivar({ afiliacionSalud: faltante });
  assertEquals([hecho(caida, "ss.salud.tiene_cobertura").valor, "parcial" in hecho(caida, "ss.salud.tiene_cobertura")], [null, false]);
  assertEquals(hecho(caida, "ss.salud.entidades").parcial, []);
  assertEquals(perfilDesdeHechos(caida, "seguridadSocial"), perfilDelCrudo());
});

Deno.test("ss.militar_policial@1: el familiar y el registro de otra persona se descartan, y pesa el servicio activo", () => {
  const doc = derivar({
    afiliacionIssfacCertMedico: ok({
      afiliaciones: [
        { cedula: CEDULA, categoria: "Militar en Servicio Pasivo" },
        { cedula: CEDULA, categoria: "Esposa de Militar en Servicio Activo" },
        { cedula: OTRA, categoria: "Militar en Servicio Activo" },
      ],
    }),
    afiliacionSiisspol: ok({ afiliacionSiisspol: [{ cedula: CEDULA, afiliaciones: [{ servicio: "ACTIVO" }] }] }),
  });
  assertEquals(hecho(doc, "ss.policia.titular").valor, true);
  assertEquals(hecho(doc, "ss.militar.titular").valor, false);
  assertEquals(hecho(doc, "ss.servicio.militar_o_policial").valor, "policía en servicio activo");
  assertEquals(hecho(doc, "ss.servicio.militar_o_policial").registros.map((r) => `${r.fuente}#${r.indice}`), ["afiliacionSiisspol#0"]);
  assertEquals(descartes(hecho(doc, "ss.servicio.militar_o_policial")), [
    "afiliacionIssfacCertMedico#0:pesa_otro_servicio_de_la_persona",
    "afiliacionIssfacCertMedico#1:familiar_cubierto_o_sin_servicio",
    "afiliacionIssfacCertMedico#2:registro_de_otra_persona",
  ]);
  assertEquals(perfilDesdeHechos(doc, "seguridadSocial"), perfilDelCrudo());
});

Deno.test("un montepío no es titular, y un solo registro militar no descarta nada", () => {
  const montepio = derivar({ afiliacionIssfacCertMedico: ok({ afiliaciones: [{ cedula: CEDULA, categoria: "Montepío" }] }) });
  assertEquals(hecho(montepio, "ss.militar.titular").valor, false);
  assertEquals(hecho(montepio, "ss.servicio.militar_o_policial").valor, "beneficiario de montepío militar");
  assertEquals(perfilDesdeHechos(montepio, "seguridadSocial"), perfilDelCrudo());

  const militar = derivar({ afiliacionIssfacCertMedico: ok({ afiliaciones: [{ cedula: CEDULA, categoria: "Militar en Servicio Activo" }] }) });
  assertEquals(hecho(militar, "ss.militar.titular").valor, true);
  assertEquals(hecho(militar, "ss.militar.titular").descartados, undefined);
  assertEquals(perfilDesdeHechos(militar, "seguridadSocial"), perfilDelCrudo());
});

Deno.test("seguro militar caído: sin valor con el parcial; Fuerza Armada en faltante no cuenta como caída", () => {
  const caida = derivar({
    afiliacionIssfacCertMedico: { status: "error", data: null },
    afiliacionSiisspol: ok({ afiliacionSiisspol: [{ cedula: CEDULA, afiliaciones: [{ servicio: "RETIRO" }] }] }),
  });
  const policia = hecho(caida, "ss.policia.titular");
  assertEquals([policia.valor, policia.motivo, policia.parcial], [null, "fuente_sin_respuesta", true]);
  assertEquals(hecho(caida, "ss.servicio.militar_o_policial").parcial, "policía en servicio pasivo (retirado)");
  assertEquals(perfilDesdeHechos(caida, "seguridadSocial"), perfilDelCrudo());

  // BASE trae Fuerza Armada en faltante, como en las 2.567 personas del respaldo.
  assertEquals(hecho(derivar({}), "ss.militar.titular").calidad, "confirmado_por_tercero");
});
