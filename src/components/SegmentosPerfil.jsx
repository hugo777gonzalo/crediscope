import { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Landmark,
  Building2,
  Scale,
  Gavel,
  Siren,
  Briefcase,
  Receipt,
  HeartPulse,
  Home,
  Users,
  User,
  MapPin,
  Car,
  Database,
} from "lucide-react";
import { GRUPOS_CONFIG, filasVisibles } from "../lib/perfilClienteCampos.js";

// Renderiza el Perfil del Cliente (tarjetas por segmento + aviso de
// controles de bloqueo) — compartido entre PerfilCliente.jsx (vista
// completa) y AnalisisIA.jsx (sección colapsada al final, ver prop
// `collapsible`). Puramente informativo, sin positivo/negativo — ver
// nota completa en PerfilCliente.jsx.

const ORDEN_GRUPOS = [
  "cumplimiento",
  "riesgoSeguridadCiudadana",
  "comportamientoBancario",
  "comportamientoCooperativas",
  "riesgoJudicialCrediticio",
  "riesgoJudicialCivil",
  "riesgoPenal",
  "laboral",
  "tributario",
  "seguridadSocial",
  "patrimonio",
  "familia",
  "identidad",
  "contacto",
  "transitoVehicular",
  "comportamientoInterno",
];

const ETIQUETAS_GRUPO = {
  cumplimiento: "Cumplimiento y Listas de Control",
  riesgoSeguridadCiudadana: "Riesgo de Seguridad Ciudadana",
  comportamientoBancario: "Comportamiento Bancos / BIESS / Diners",
  comportamientoCooperativas: "Comportamiento Cooperativas",
  riesgoJudicialCrediticio: "Riesgo Judicial Crediticio",
  riesgoJudicialCivil: "Riesgo Judicial / Civil (otros)",
  riesgoPenal: "Riesgo Penal / Fiscalía",
  laboral: "Situación Laboral e Ingresos",
  tributario: "Situación Tributaria (SRI)",
  seguridadSocial: "Seguridad Social",
  patrimonio: "Patrimonio",
  familia: "Núcleo Familiar",
  identidad: "SocioDemográficas",
  contacto: "Contacto y Domicilio",
  transitoVehicular: "Tránsito Vehicular",
  comportamientoInterno: "Comportamiento Interno (Fuente Externa)",
};

const ICONOS_GRUPO = {
  cumplimiento: ShieldCheck,
  riesgoSeguridadCiudadana: ShieldAlert,
  comportamientoBancario: Landmark,
  comportamientoCooperativas: Building2,
  riesgoJudicialCrediticio: Scale,
  riesgoJudicialCivil: Gavel,
  riesgoPenal: Siren,
  laboral: Briefcase,
  tributario: Receipt,
  seguridadSocial: HeartPulse,
  patrimonio: Home,
  familia: Users,
  identidad: User,
  contacto: MapPin,
  transitoVehicular: Car,
  comportamientoInterno: Database,
};

function SegmentoCard({ grupo, filas, mensajeVacio }) {
  const Icono = ICONOS_GRUPO[grupo];
  return (
    <div className="crediscope-card" style={{ padding: "14px 20px", marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        {Icono ? <Icono size={18} color="var(--text-muted)" /> : null}
        <p style={{ fontWeight: 600, margin: 0 }}>{ETIQUETAS_GRUPO[grupo]}</p>
      </div>
      {filas.length > 0 ? (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          {filas.map((f, i) => (
            <span key={f.etiqueta}>
              {i > 0 ? " · " : ""}
              <span className="crediscope-muted">{f.etiqueta}:</span> {f.texto}
            </span>
          ))}
        </p>
      ) : (
        <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>
          {mensajeVacio}
        </p>
      )}
    </div>
  );
}

function AvisoBloqueo({ hallazgosBloqueantes }) {
  if (hallazgosBloqueantes.length === 0) return null;
  return (
    <div className="crediscope-card" style={{ borderColor: "var(--warn)", background: "#fffbeb" }}>
      <p style={{ fontWeight: 600, color: "var(--warn)", margin: "0 0 6px" }}>
        {hallazgosBloqueantes.length} control{hallazgosBloqueantes.length > 1 ? "es" : ""} de bloqueo activo
        {hallazgosBloqueantes.length > 1 ? "s" : ""}
      </p>
      <ul className="crediscope-list" style={{ margin: 0 }}>
        {hallazgosBloqueantes.map((h) => (
          <li key={h.code}>{h.message}</li>
        ))}
      </ul>
    </div>
  );
}

function ListaSegmentos({ standardProfile, segmentConfig }) {
  const modoPorGrupo = {};
  for (const s of segmentConfig || []) modoPorGrupo[s.grupo] = s.modo;

  const tarjetas = ORDEN_GRUPOS.map((grupo) => {
    const modo = modoPorGrupo[grupo] ?? "con_datos";
    if (modo === "nunca") return null;
    const config = GRUPOS_CONFIG[grupo];
    const tienePresencia = config?.presencia(standardProfile);
    if (modo === "con_datos" && !tienePresencia) return null;
    return <SegmentoCard key={grupo} grupo={grupo} filas={filasVisibles(standardProfile, grupo)} mensajeVacio={config?.mensajeVacio} />;
  });

  return <div className="crediscope-segment-grid">{tarjetas}</div>;
}

export default function SegmentosPerfil({ standardProfile, segmentConfig, controlBloqueo, collapsible = false }) {
  const [expandido, setExpandido] = useState(!collapsible);
  const hallazgosBloqueantes = (controlBloqueo?.hallazgos || []).filter((h) => h.bloqueante);

  if (!standardProfile) return null;

  if (!collapsible) {
    return (
      <>
        <AvisoBloqueo hallazgosBloqueantes={hallazgosBloqueantes} />
        <ListaSegmentos standardProfile={standardProfile} segmentConfig={segmentConfig} />
      </>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      <AvisoBloqueo hallazgosBloqueantes={hallazgosBloqueantes} />
      <button className="crediscope-btn crediscope-btn-ghost" onClick={() => setExpandido((v) => !v)}>
        {expandido ? "Ocultar" : "Ver"} Perfil del Cliente completo
      </button>
      {expandido ? (
        <div style={{ marginTop: 12 }}>
          <ListaSegmentos standardProfile={standardProfile} segmentConfig={segmentConfig} />
        </div>
      ) : null}
    </div>
  );
}
