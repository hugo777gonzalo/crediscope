// ¿Quién es el patrono de un aporte al IESS? Una sola regla para la
// clasificación de ingresos, el perfil laboral y el perfil estandarizado.
//
// POR QUÉ EL RUC Y NO EL NOMBRE
//
// El RUC de una persona natural es su cédula seguida de 001 (002, 003 si
// abrió más de uno), y el IESS lo trae en cada aporte (tiess.rucEmp) y en el
// mecanizado (rucEmpresa). Es una prueba exacta de que la persona se afilió
// a sí misma como patrono de su negocio.
//
// La regla anterior miraba sólo el nombre: el empleador tenía que llevar un
// apellido y todos los nombres de pila del cliente. Daba falsos positivos
// con el padre homónimo -- 0912774072 y 0920873858 figuraban como su propio
// empleador trabajando para alguien con sus mismos nombres y otro segundo
// apellido, con un RUC que no es el suyo. Medido el 2026-09-26 sobre el
// crudo de 2.567 clientes: 483 aportan bajo su propio RUC.
//
// Y POR QUÉ IMPORTA
//
// Desde marco-v17 el negocio lo tenía decidido: si el patrono registrado es
// la misma persona, es trabajo por cuenta propia formalizado, nunca un
// empleo. La clasificación no lo aplicaba: leía el código de tipo de
// empleador, que para el patrono persona natural es el SECTOR de su negocio
// ("6-CONSTRUCCION", "2-EMPRESA PRIVADA"). 40 personas quedaron como
// dependientes, con su propio aporte "reportado por un tercero" y
// confirmado -- el caso que lo destapó, 0502937691, es dueño de una
// constructora con dos empleados y se aporta el SBU.
//
// El nombre queda de respaldo para los aportes que llegan sin RUC, y exige
// las MISMAS palabras de los dos lados (sin tildes, con la Ñ rota que
// manda la fuente): el padre homónimo tiene otro apellido y no pasa. Contra
// el RUC, en los 483 casos, el nombre así comparado discrepó en uno solo.

type AnyRecord = Record<string, unknown>;

// Las palabras que no distinguen a una persona de otra.
const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "VDA", "VIUDA"]);

function palabrasDelNombre(nombre: unknown): string[] {
  return String(nombre ?? "")
    .toUpperCase()
    // La fuente manda la Ñ rota de dos maneras: "MU?OZ" y "MUÃ‘OZ".
    .replace(/Ã‘/g, "N")
    .replace(/[?�]/g, "N")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tildes; la Ñ queda como N
    .replace(/[^A-Z\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 2 && !PARTICULAS.has(p));
}

// Las mismas palabras, en cualquier orden: "PICHUCHO MUÑOZ JUAN LUIS" es
// "Juan Luis Pichucho Muñoz". Con menos de dos palabras no se afirma nada.
export function esLaMismaPersona(a: unknown, b: unknown): boolean {
  const x = new Set(palabrasDelNombre(a));
  const y = new Set(palabrasDelNombre(b));
  if (x.size < 2 || y.size < 2 || x.size !== y.size) return false;
  for (const p of x) if (!y.has(p)) return false;
  return true;
}

// El RUC es de la persona si es su cédula más un número de establecimiento.
// null: no hay RUC o no hay cédula con qué compararlo -- no se sabe.
export function rucEsDeLaPersona(ruc: unknown, cedula: string | null | undefined): boolean | null {
  const r = String(ruc ?? "").replace(/\D/g, "");
  const c = String(cedula ?? "").replace(/\D/g, "");
  if (r.length !== 13 || c.length !== 10) return null;
  return r.startsWith(c);
}

// ¿El patrono de este registro es la propia persona? Primero el RUC; si el
// registro no lo trae, el nombre del patrono contra el del cliente o contra
// el del afiliado del mismo registro (que es el cliente, escrito como lo
// escribe el IESS).
export function esSuPropioPatrono(
  registro: { ruc?: unknown; nombrePatrono?: unknown; nombreAfiliado?: unknown },
  cedula: string | null | undefined,
  nombreCliente: string | null | undefined,
): boolean {
  const porRuc = rucEsDeLaPersona(registro.ruc, cedula);
  if (porRuc !== null) return porRuc;
  return esLaMismaPersona(registro.nombrePatrono, nombreCliente) || esLaMismaPersona(registro.nombrePatrono, registro.nombreAfiliado);
}

// Un aporte de tiess o un registro de nómina (empleados): los dos traen
// rucEmp, nomEmp y nomAfi.
export function aporteDeSuPropioPatrono(a: AnyRecord, cedula: string | null | undefined, nombreCliente: string | null | undefined): boolean {
  return esSuPropioPatrono({ ruc: a.rucEmp, nombrePatrono: a.nomEmp, nombreAfiliado: a.nomAfi }, cedula, nombreCliente);
}

// En la nómina que paga una persona (fuente `empleados`), ¿este afiliado es
// ella misma? El patrono persona natural se afilia en su propia nómina: en
// 340 de 491 nóminas figura el dueño, y en 166 es el único afiliado --
// contadas así, esas personas eran "independientes con empleados" sin tener
// un solo empleado. `ci` es la cédula del afiliado cuando viene.
export function esElPropioAfiliado(e: AnyRecord, cedula: string | null | undefined, nombreCliente: string | null | undefined): boolean {
  const ci = String(e.ci ?? "").replace(/\D/g, "");
  const c = String(cedula ?? "").replace(/\D/g, "");
  if (ci.length === 10 && c.length === 10) return ci === c;
  return esLaMismaPersona(e.nomAfi, nombreCliente);
}
