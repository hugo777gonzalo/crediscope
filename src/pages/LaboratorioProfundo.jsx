import ModuloDelCorte from "../components/laboratorio/ModuloDelCorte.jsx";
import PestanaCrudo from "../components/laboratorio/PestanaCrudo.jsx";
import PestanaMotivos from "../components/laboratorio/PestanaMotivos.jsx";

// Módulo 6 del negocio: Descubrimiento profundo de variables. ¿Qué no vio el
// modelo? Del crudo de Novadata a la estructura, a lo que leyó el modelo y a
// lo que pasó con el crédito.

const conSolicitudes = (c) => Boolean(c.resumen?.solicitudes);

export const PESTANAS_PROFUNDO = [
  { clave: "crudo", texto: "Explorador del crudo", Componente: ({ ultimo, corteId }) => <PestanaCrudo resultado={ultimo("crudo")} corteId={corteId} /> },
  { clave: "motivos", texto: "Motivos del impago", calculo: "motivos", requiere: conSolicitudes, Componente: ({ ultimo }) => <PestanaMotivos resultado={ultimo("motivos")} /> },
];

export default function LaboratorioProfundo() {
  return (
    <ModuloDelCorte
      titulo="Descubrimiento profundo de variables"
      descripcion="¿Qué no vio el modelo? El crudo de Novadata, la estructura, lo que leyó el modelo y los casos donde se equivocó."
      pestanas={PESTANAS_PROFUNDO}
      poblacionPorDefecto="solicitudes"
    />
  );
}
