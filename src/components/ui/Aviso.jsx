import { AlertTriangle, CheckCircle2, Info, FlaskConical } from "lucide-react";

// El cuadro de aviso de la aplicación: un ícono, un título opcional y el texto.
//
// Había una veintena hechos a mano (un <div className="crediscope-card"
// style={{ borderColor: "var(--warn)" }}> con su ícono, su flexbox y su
// margen), cada uno un poco distinto. El color dice la gravedad y el ícono la
// repite, para que no dependa sólo del color:
//
//   peligro       algo está mal o no se puede seguir           (rojo)
//   advertencia   hay que tener cuidado con lo que se lee      (ámbar)
//   informacion   contexto que ayuda, sin urgencia             (índigo)
//   exito         algo salió bien                              (verde)
//   sintetico     datos inventados para probar                 (ámbar, con el matraz)

const TIPOS = {
  peligro: { Icono: AlertTriangle, rol: "alert" },
  advertencia: { Icono: AlertTriangle, rol: "note" },
  informacion: { Icono: Info, rol: "note" },
  exito: { Icono: CheckCircle2, rol: "status" },
  sintetico: { Icono: FlaskConical, rol: "note" },
};

export default function Aviso({ tipo = "advertencia", titulo = null, children }) {
  const { Icono, rol } = TIPOS[tipo] ?? TIPOS.advertencia;
  return (
    <div className={`crediscope-card crediscope-aviso crediscope-aviso-${tipo === "sintetico" ? "advertencia" : tipo}`} role={rol}>
      <Icono size={18} className="crediscope-aviso-icono" aria-hidden="true" />
      <div className="crediscope-aviso-cuerpo">
        {titulo ? <p className="crediscope-aviso-titulo">{titulo}</p> : null}
        {children}
      </div>
    </div>
  );
}
