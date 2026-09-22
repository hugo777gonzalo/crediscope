import {
  Landmark,
  Receipt,
  ShieldAlert,
  Wallet,
  TrendingUp,
  Activity,
  Building2,
  CreditCard,
  ListChecks,
  HeartHandshake,
  Ban,
  Users,
  MapPin,
  Search,
  Database,
} from "lucide-react";
import { ESPEC } from "../../../supabase/functions/_shared/aval-estructura.ts";
import { formatearValorAval } from "../../lib/avalCampos.js";
import TablaDeudas from "./TablaDeudas.jsx";

// Perfil Aval, la parte de abajo: una tarjeta por grupo, con el mismo
// estilo visual de SegmentosPerfil.jsx (Novadata) pero leyendo
// directamente ESPEC -- la estructura de Aval es plana (grupo/campo por
// fila), no anidada como StandardClientProfile, así que no calza en el
// renderer de Novadata (ver ETIQUETAS_GRUPO/GRUPOS_CONFIG ahí).
//
// "Identidad", "Score" y "Factores del score" NO aparecen acá: identidad
// (nombre/cédula) ya la dice ClienteHeader, el score va en el ScoreGauge
// del encabezado, y los factores en FactoresAval.jsx como tabla +/-;
// repetirlos acá como campos sueltos sería la misma información dicha
// dos veces de dos formas distintas.

const GRUPOS_OCULTOS = new Set(["Identidad", "Score", "Factores del score"]);

const ORDEN_GRUPOS = [
  "Deuda actual",
  "Deudas por entidad", // no es un grupo de ESPEC: se arma con la lista
  "Deuda contingente (codeudor/garante)",
  "Carga financiera",
  "Tendencia de deuda",
  "Comportamiento de pago",
  "Acreedores",
  "Tarjetas de crédito",
  "Operaciones",
  "Garantías otorgadas a terceros",
  "Cuentas corrientes",
  "Relaciones",
  "Contacto",
  "Consultas al buró",
  "Meta",
];

const ICONOS_GRUPO = {
  "Deuda actual": Landmark,
  "Deudas por entidad": Receipt,
  "Deuda contingente (codeudor/garante)": ShieldAlert,
  "Carga financiera": Wallet,
  "Tendencia de deuda": TrendingUp,
  "Comportamiento de pago": Activity,
  Acreedores: Building2,
  "Tarjetas de crédito": CreditCard,
  Operaciones: ListChecks,
  "Garantías otorgadas a terceros": HeartHandshake,
  "Cuentas corrientes": Ban,
  Relaciones: Users,
  Contacto: MapPin,
  "Consultas al buró": Search,
  Meta: Database,
};

// grupo -> [[campo, tipo, desc], ...], en el orden en que aparecen en ESPEC.
const CAMPOS_POR_GRUPO = new Map();
for (const [grupo, campo, tipo, , , desc] of ESPEC) {
  if (GRUPOS_OCULTOS.has(grupo)) continue;
  if (!CAMPOS_POR_GRUPO.has(grupo)) CAMPOS_POR_GRUPO.set(grupo, []);
  CAMPOS_POR_GRUPO.get(grupo).push([campo, tipo, desc]);
}

function Tarjeta({ titulo, children }) {
  const Icono = ICONOS_GRUPO[titulo];
  return (
    <div className="crediscope-card">
      <h3 style={{ margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
        {Icono ? <Icono size={17} style={{ color: "var(--text-muted)" }} /> : null}
        {titulo}
      </h3>
      {children}
    </div>
  );
}

// Una fila campo/valor. Se omiten los null -- un hueco es un hueco, no
// se disimula mostrando "N/A" en cada uno de los 70 y pico campos.
function FilaCampo({ etiqueta, valor, tipo, resaltar }) {
  if (valor === null || valor === undefined) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", borderTop: "1px solid var(--border)" }}>
      <span className="crediscope-muted" style={{ fontSize: 13 }}>{etiqueta}</span>
      <strong style={{ fontSize: 13, color: resaltar ? "var(--bad)" : undefined, textAlign: "right" }}>
        {formatearValorAval(valor, tipo)}
      </strong>
    </div>
  );
}

export default function SegmentosAval({ estructura }) {
  if (!estructura) return null;

  const grupos = ORDEN_GRUPOS.filter((g) => {
    if (g === "Deudas por entidad") return (estructura.deudasPorEntidad || []).length > 0 || true; // siempre se muestra, aunque vacía
    const campos = CAMPOS_POR_GRUPO.get(g) || [];
    return campos.some(([campo]) => estructura[campo] !== null && estructura[campo] !== undefined);
  });

  return (
    <div className="crediscope-secciones" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
      {grupos.map((g) => {
        if (g === "Deudas por entidad") {
          return (
            <Tarjeta key={g} titulo={g}>
              <TablaDeudas filas={estructura.deudasPorEntidad} />
            </Tarjeta>
          );
        }
        if (g === "Deuda contingente (codeudor/garante)") {
          const campos = CAMPOS_POR_GRUPO.get(g) || [];
          return (
            <Tarjeta key={g} titulo={g}>
              {campos.map(([campo, tipo, desc]) => (
                <FilaCampo key={campo} etiqueta={desc} valor={estructura[campo]} tipo={tipo} />
              ))}
              {(estructura.deudasComoCodeudorGarante || []).length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <TablaDeudas filas={estructura.deudasComoCodeudorGarante} colorAcento="var(--warn)" />
                </div>
              ) : null}
            </Tarjeta>
          );
        }
        if (g === "Cuentas corrientes") {
          const inhabilitado = estructura.inhabilitadoCtaCte;
          const campos = (CAMPOS_POR_GRUPO.get(g) || []).filter(([campo]) => campo !== "inhabilitadoCtaCte");
          return (
            <Tarjeta key={g} titulo={g}>
              {inhabilitado ? (
                <span className="crediscope-tag crediscope-tag-bad" style={{ display: "inline-block", marginBottom: 10 }}>
                  Inhabilitado para cuentas corrientes
                </span>
              ) : (
                <p className="crediscope-muted" style={{ margin: "0 0 10px", fontSize: 13 }}>Sin inhabilitación registrada.</p>
              )}
              {inhabilitado ? campos.map(([campo, tipo, desc]) => (
                <FilaCampo key={campo} etiqueta={desc} valor={estructura[campo]} tipo={tipo} />
              )) : null}
            </Tarjeta>
          );
        }
        const campos = CAMPOS_POR_GRUPO.get(g) || [];
        return (
          <Tarjeta key={g} titulo={g}>
            {campos.map(([campo, tipo, desc]) => (
              <FilaCampo key={campo} etiqueta={desc} valor={estructura[campo]} tipo={tipo} />
            ))}
          </Tarjeta>
        );
      })}
    </div>
  );
}
