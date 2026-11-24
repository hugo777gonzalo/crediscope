// quienDemanda(): una entidad no se lee como persona natural (negocio, 2026-11-24, tras la revisión con
// casos reales de E10). Cada caso de abajo es un demandante real de la cartera (una entidad se puede citar;
// los nombres de personas no) o uno inventado. Los apellidos que parecen una marca van aparte: son los que
// tienen que seguir como persona.
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { categoriaDeDemanda, CATEGORIA_COBRO, esDemandaDeCobro, quienDemanda, tipoDeCobroLegible } from "./demandas.ts";

const FINANCIERA = "institucion_financiera";

Deno.test("quién demanda: lo que ya se leía bien sigue igual", () => {
  assertEquals(quienDemanda("BANCO DEL ZZPRUEBA S.A."), FINANCIERA);
  assertEquals(quienDemanda("COOPERATIVA DE AHORRO Y CREDITO ZZPRUEBA LTDA"), FINANCIERA);
  assertEquals(quienDemanda("IMPORTADORA ZZPRUEBA CIA. LTDA."), "empresa");
  assertEquals(quienDemanda("ZZPRUEBA COMERCIAL S.A."), "empresa");
  assertEquals(quienDemanda("PEREZ ZZINVENTADA JUAN CARLOS"), "persona");
  assertEquals(quienDemanda(""), null);
  assertEquals(quienDemanda(null), null);
});

Deno.test("quién demanda: «Banco Pichincha Ca» (como lo escribe e-SATJE) es una institución financiera", () => {
  assertEquals(quienDemanda("Banco Pichincha Ca"), FINANCIERA);
  assertEquals(quienDemanda("BANCO PICHINCHA C.A."), FINANCIERA);
  assertEquals(quienDemanda("BANCO PICHINCHA CA"), FINANCIERA);
  // Sin la palabra «Banco» la forma societaria al final es de una empresa, no de una persona.
  assertEquals(quienDemanda("PICHINCHA CA"), "empresa");
  assertEquals(quienDemanda("ZZPRUEBA C.A."), "empresa");
  assertEquals(quienDemanda("ZZPRUEBA C.A"), "empresa");
});

Deno.test("quién demanda: el banco pegado a otra palabra o abreviado, y la cooperativa abreviada", () => {
  assertEquals(quienDemanda("AUSTROBANK OVERSEAS ( LTD ) BAHAMAS"), FINANCIERA);
  assertEquals(quienDemanda("FILANBANCO"), FINANCIERA);
  assertEquals(quienDemanda("ZZINVENTADA ZZINVENTADA SANTIAGO P.L.D.Q..R/ PRODUBANCO /"), FINANCIERA);
  assertEquals(quienDemanda("P.L.D.Q.R. BCO. PICHINCHA ZZINVENTADA MARIA"), FINANCIERA);
  assertEquals(quienDemanda("COOP. DE AHORRO Y CREDITO ZZPRUEBA"), FINANCIERA);
  assertEquals(quienDemanda("COOP DE AHORRO Y CRÉDITO ZZPRUEBA"), FINANCIERA);
});

Deno.test("quién demanda: LTD, INC, CORPORATION y las demás formas societarias", () => {
  assertEquals(quienDemanda("ZZPRUEBA OVERSEAS (LTD)"), "empresa");
  assertEquals(quienDemanda("ST. GALLEN MAGNAGEMENT INC."), "empresa");
  assertEquals(quienDemanda("NIPRO MEDICAL CORPORATION"), "empresa");
  assertEquals(quienDemanda("ZZPRUEBA CORP"), "empresa");
  assertEquals(quienDemanda("INVERSIONES DE LA CAPITAL S.C."), "empresa");
  assertEquals(quienDemanda("NILOTEX TELAS S.C.C."), "empresa");
  assertEquals(quienDemanda("ZZPRUEBA S.R.L."), "empresa");
});

Deno.test("quién demanda: la S.A. o la C.A. pegada a otra palabra", () => {
  assertEquals(quienDemanda("TECNICENTRO DEL AUSTRO S.A.TEDASA"), "empresa");
  assertEquals(quienDemanda("ZZPRUEBA C.A.ZZSIGLA"), "empresa");
  assertEquals(quienDemanda("(ZZPRUEBA S.A.)"), "empresa");
  // Un apellido que termina en esas letras no es una sociedad: la regla pide los dos puntos.
  assertEquals(quienDemanda("ZZINVENTADA ROSA.ANA"), "persona");
  assertEquals(quienDemanda("ZZINVENTADA ROSA ANA"), "persona");
});

Deno.test("quién demanda: fondo, comité, agencia, centro, fideicomiso y ejército", () => {
  assertEquals(quienDemanda("FONDO DE CESANTIA PRIVADO DEL PERSONAL DE LA FUNCION JUDICIAL DEL ECUADOR - FCPC"), "empresa");
  assertEquals(quienDemanda("FONDO COMPLEMENTARIO DE JUBILACION PREVISIONAL CERRADO DE LOS TRABAJADORES DE E.P. ZZPRUEBA"), "empresa");
  assertEquals(quienDemanda("ZZINVENTADA ANA, GERENTE Y REPRESENTANTE LEGAL DEL FONDO COMPLEMENTARIO ZZPRUEBA"), "empresa");
  assertEquals(quienDemanda("comite hemisferio metropolitano del sur (representante legal ZZINVENTADA JUAN)"), "empresa");
  assertEquals(quienDemanda("Comité hemisferio metropolitano del sur"), "empresa");
  assertEquals(quienDemanda("AGENCIA NACIONAL DE TRASNITO"), "empresa");
  assertEquals(quienDemanda("CENTRO DE RECONVERSION ECONOMICA DEL AZUAY, CAÑAR Y MORONA SANTIAGO -CREA-"), "empresa");
  assertEquals(quienDemanda("fideicomiso octava titularizacion cartera automotriz -amazonas"), "empresa");
  assertEquals(quienDemanda("ZZINVENTADA JUAN APODERADO DEL FIDEICOMISO ZZPRUEBA"), "empresa");
  assertEquals(quienDemanda("ZZINVENTADA JUAN COMANDANTE DEL CUERPO DE INGENIEROS DEL EJERCITO"), "empresa");
  assertEquals(quienDemanda("ESTADO ECUATORIANO"), "empresa");
  assertEquals(quienDemanda("EDIFICIO ZZPRUEBA"), "empresa");
  // El fiscal que figura como demandante no es el acreedor: queda como estaba (decisión del negocio pendiente).
  assertEquals(quienDemanda("FISCALIA DEL ZZPRUEBA, ZZINVENTADA JUAN"), "persona");
  assertEquals(quienDemanda("FISCAL, ZZINVENTADA HILDA"), "persona");
});

Deno.test("quién demanda: las siglas de una cooperativa, pero no «Cooper»", () => {
  assertEquals(quienDemanda("COOPMEGO"), "empresa");
  assertEquals(quienDemanda("COOP. LUZ DEL VALLE"), "empresa");
  assertEquals(quienDemanda("ZZINVENTADA JUAN REPRESENTANTE LEGAL DE LA COOP. LUZ DEL VALLE"), "empresa");
  assertEquals(quienDemanda("PROCURADOR JUDICIAL DE LA PARTE ACTORA CON LA NUEVA DENOMINACION \" COOPCCP\""), "empresa");
  assertEquals(quienDemanda("COOPER ZZINVENTADA ANA"), "persona");
  assertEquals(quienDemanda("ZZINVENTADA COOPER JUAN"), "persona");
});

Deno.test("quién demanda: un representante o un procurador es de entidad por lo que el nombre de quien representa lleve", () => {
  // La madre es la representante legal de un menor: una persona natural no deja de serlo porque alguien la represente.
  assertEquals(quienDemanda("ZZINVENTADA SANDRA MADRE Y REPRESENTANTE LEGAL DE ZZINVENTADA MAXIMILIANO"), "persona");
  assertEquals(quienDemanda("GERENTE GENERAL Y REPRESENTANTE LEGAL, ZZINVENTADA DIEGO, PROCURADOR JUDICIAL DE ZZINVENTADA AURELIO"), "persona");
  // Un procurador o un apoderado de una persona (o de quien no se sabe) no hace de ella una entidad.
  assertEquals(quienDemanda("ZZINVENTADA RICHARD PROCURADOR JUDICIAL DE ZZINVENTADA LUIS GONZALO"), "persona");
  assertEquals(quienDemanda("ZZINVENTADA VICTOR (APODERADO)"), "persona");
  assertEquals(quienDemanda("ZZINVENTADA GLADYS (PROCURADORA JUDICIAL DE ZZSINMARCA)"), "persona");
  // Lo es cuando lo que representa lo dice en su nombre.
  assertEquals(quienDemanda("ZZINVENTADA GABRIELA (PROCURADORA JUDICIAL DEL FONDO DE CESANTIA PRIVADO ZZPRUEBA)"), "empresa");
  assertEquals(quienDemanda("ZZINVENTADA JUAN, PROCURADOR JUDICIAL DEL BANCO ZZPRUEBA C.A."), FINANCIERA);
});

Deno.test("quién demanda: los apellidos que contienen las marcas siguen siendo una persona", () => {
  for (const nombre of [
    "FONDON ZZINVENTADA JUAN", "ZZINVENTADA FONDON ANA", "BANQUERO ZZINVENTADA PEDRO", "ZZINVENTADA BANQUERO LUIS",
    "BANCOS ZZINVENTADA ROSA", "BLANCO ZZINVENTADA MARIA", "BANKS ZZINVENTADA ANA", "COMITRE ZZINVENTADA ANA", "AGENCIO ZZINVENTADA JUAN",
    "CENTROSA ZZINVENTADA ANA", "FISCALINI ZZINVENTADA JUAN", "ZZINVENTADA CACERES ANA", "ZZINVENTADA BARCA JUAN", "INCA ZZINVENTADA ROSA",
    "ZZINVENTADA CORPUS JUAN", "ZZINVENTADA ALTD ANA", "LLCA ZZINVENTADA", "ZZINVENTADA SAC JUAN", "ZZINVENTADA CAMACHO ANA", "BCOS ZZINVENTADA",
    "COOPERMAN ZZINVENTADA JUAN",
  ]) {
    assertEquals(quienDemanda(nombre), "persona", nombre);
  }
});

Deno.test("quién demanda: un demandante con el nombre de una entidad cambia la categoría de la demanda sólo si es financiera", () => {
  // Un banco pegado a otra palabra, o abreviado, ya hace de cobro una demanda cuyo tipo no dice el tema.
  assertEquals(esDemandaDeCobro("OTROS", "FILANBANCO"), true);
  assertEquals(esDemandaDeCobro("OTROS", "P.L.D.Q.R. BCO. PICHINCHA ZZINVENTADA MARIA"), true);
  assertEquals(categoriaDeDemanda("VERBAL SUMARIO", "AUSTROBANK OVERSEAS ( LTD ) BAHAMAS"), CATEGORIA_COBRO);
  assertEquals(tipoDeCobroLegible("OTROS", "FILANBANCO"), "Otros (demanda de una institución financiera)");
  // Una entidad que no es financiera no: el tipo sigue decidiendo.
  assertEquals(esDemandaDeCobro("OTROS", "FONDO DE CESANTIA PRIVADO DEL PERSONAL DE LA FUNCION JUDICIAL DEL ECUADOR - FCPC"), false);
  assertEquals(esDemandaDeCobro("OTROS", "TECNICENTRO DEL AUSTRO S.A.TEDASA"), false);
  assertEquals(esDemandaDeCobro("OTROS", "COOP. LUZ DEL VALLE"), false);
  // Con un tipo que sí dice el cobro, lo es quien sea el demandante.
  assertEquals(esDemandaDeCobro("COBRO DE PAGARÉ A LA ORDEN", "COOPMEGO"), true);
  // Los apellidos no cambian nada.
  assertEquals(esDemandaDeCobro("OTROS", "BANQUERO ZZINVENTADA LUIS"), false);
});
