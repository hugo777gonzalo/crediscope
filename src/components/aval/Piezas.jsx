import { formatearValorAval } from "../../lib/avalCampos.js";

// Piezas chicas que comparten las tarjetas del reporte de Aval.

export function TituloTarjeta({ Icono, children }) {
  return (
    <h3 className="crediscope-aval-titulo">
      {Icono ? (
        <span className="crediscope-aval-titulo-icono">
          <Icono size={16} />
        </span>
      ) : null}
      {children}
    </h3>
  );
}

// Un cero se muestra apagado y no se esconde: es Aval diciendo "no hay",
// que es un dato. `alerta` pinta de rojo sólo cuando hay algo que ver
// (vencido, demanda, castigada, mora) -- un 0 en rojo gritaría por nada.
export function Valor({ valor, tipo, alerta = false }) {
  const texto = formatearValorAval(valor, tipo);
  const esCero = valor === 0;
  const clase = esCero ? "crediscope-aval-cero" : alerta && typeof valor === "number" && valor > 0 ? "crediscope-aval-malo" : undefined;
  return <span className={clase}>{texto}</span>;
}

// Un null no es un cero: la fila se omite, como en el resto de la app, en
// vez de llenar la tarjeta de rayas. `siFalta` es para los pocos campos
// donde Aval define el null (fechaUltimoVencido: null = ninguno).
export function FilaCampo({ etiqueta, valor, tipo, alerta, siFalta }) {
  if ((valor === null || valor === undefined) && !siFalta) return null;
  return (
    <li className="crediscope-aval-fila-campo">
      <span>{etiqueta}</span>
      {/* Un texto largo (dirección, acreedor) puede partirse; un monto
          partido en dos renglones ya no se lee como número. */}
      <strong style={tipo === "texto" ? undefined : { whiteSpace: "nowrap" }}>
        {valor === null || valor === undefined ? siFalta : <Valor valor={valor} tipo={tipo} alerta={alerta} />}
      </strong>
    </li>
  );
}

export function Cifra({ etiqueta, children, titulo }) {
  return (
    <div className="crediscope-aval-cifra" title={titulo}>
      <span>{etiqueta}</span>
      <strong>{children}</strong>
    </div>
  );
}
