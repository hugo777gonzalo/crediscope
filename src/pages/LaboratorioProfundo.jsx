import ModuloDelCorte from "../components/laboratorio/ModuloDelCorte.jsx";
import PestanaCrudo from "../components/laboratorio/PestanaCrudo.jsx";
import PestanaMotivos from "../components/laboratorio/PestanaMotivos.jsx";
import PestanaResumenProfundo from "../components/laboratorio/PestanaResumenProfundo.jsx";
import PestanaEstructura from "../components/laboratorio/PestanaEstructura.jsx";
import PestanaEntradaAlModelo from "../components/laboratorio/PestanaEntradaAlModelo.jsx";
import PestanaLosQueCayeron from "../components/laboratorio/PestanaLosQueCayeron.jsx";
import PestanaInvestigacion from "../components/laboratorio/PestanaInvestigacion.jsx";
import PestanaTaller from "../components/laboratorio/PestanaTaller.jsx";
import PestanaCandidatas from "../components/laboratorio/PestanaCandidatas.jsx";
import { PestanaImportancia } from "../components/laboratorio/PestanasPesadas.jsx";

// Módulo 6 del negocio: Descubrimiento profundo de variables. ¿Qué no vio el
// modelo? Del crudo de Novadata a la estructura, a lo que leyó el modelo y a
// lo que pasó con el crédito; los casos donde se equivocó; y el camino de
// una variable nueva hasta una propuesta.

const conSolicitudes = (c) => Boolean(c.resumen?.solicitudes);

export const PESTANAS_PROFUNDO = [
  { clave: "resumen", texto: "Resumen", usaPoblacion: true, Componente: PestanaResumenProfundo },
  { clave: "crudo", texto: "Explorador del crudo", Componente: ({ ultimo, corteId, corte }) => <PestanaCrudo resultado={ultimo("crudo")} corteId={corteId} corte={corte} /> },
  { clave: "estructura", texto: "Estructura", Componente: PestanaEstructura },
  { clave: "entrada", texto: "Entrada al modelo", Componente: PestanaEntradaAlModelo },
  { clave: "cayeron", texto: "Los que cayeron", usaPoblacion: true, Componente: PestanaLosQueCayeron },
  { clave: "investigacion", texto: "Investigación de casos", usaPoblacion: true, Componente: PestanaInvestigacion },
  { clave: "motivos", texto: "Motivos del impago", calculo: "motivos", requiere: conSolicitudes, Componente: ({ ultimo }) => <PestanaMotivos resultado={ultimo("motivos")} /> },
  { clave: "importancia", texto: "Importancia (bosque y SHAP)", Componente: ({ ultimo, corteId }) => <PestanaImportancia resultado={ultimo("importancia")} corteId={corteId} /> },
  { clave: "taller", texto: "Taller de variables", usaPoblacion: true, Componente: PestanaTaller },
  { clave: "candidatas", texto: "Registro de candidatas", Componente: PestanaCandidatas },
];

export default function LaboratorioProfundo() {
  return (
    <ModuloDelCorte
      titulo="Descubrimiento profundo de variables"
      descripcion="¿Qué no vio el modelo? El crudo de Novadata, la estructura, lo que leyó el modelo, los casos donde se equivocó y el camino de una variable nueva."
      pestanas={PESTANAS_PROFUNDO}
      poblacionPorDefecto="solicitudes"
    />
  );
}
