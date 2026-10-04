import ModuloDelCorte from "../components/laboratorio/ModuloDelCorte.jsx";
import PestanaVariables from "../components/laboratorio/PestanaVariables.jsx";
import PestanaResumenEstadistico from "../components/laboratorio/PestanaResumenEstadistico.jsx";
import PestanaDescriptivas from "../components/laboratorio/PestanaDescriptivas.jsx";
import PestanaDistribuciones from "../components/laboratorio/PestanaDistribuciones.jsx";
import PestanaFaltantes from "../components/laboratorio/PestanaFaltantes.jsx";
import PestanaCorrelaciones from "../components/laboratorio/PestanaCorrelaciones.jsx";
import PestanaInferencia from "../components/laboratorio/PestanaInferencia.jsx";
import PestanaTramos from "../components/laboratorio/PestanaTramos.jsx";
import PestanaSignificancia from "../components/laboratorio/PestanaSignificancia.jsx";

// Módulo 5 del negocio: Descubrimiento estadístico. ¿Qué anticipa el
// impago? Por defecto mira todas las solicitudes observadas cuando el corte
// las tiene: con sólo lo desembolsado hay ~20 malos y todo es ruido.

export const PESTANAS_ESTADISTICA = [
  { clave: "resumen", texto: "Resumen", usaPoblacion: true, Componente: PestanaResumenEstadistico },
  { clave: "descriptivas", texto: "Descriptivas", usaPoblacion: true, Componente: PestanaDescriptivas },
  { clave: "distribuciones", texto: "Distribuciones", usaPoblacion: true, Componente: PestanaDistribuciones },
  { clave: "faltantes", texto: "Faltantes", usaPoblacion: true, Componente: PestanaFaltantes },
  { clave: "correlaciones", texto: "Correlaciones", usaPoblacion: true, Componente: PestanaCorrelaciones },
  { clave: "inferencia", texto: "Inferencia", usaPoblacion: true, Componente: PestanaInferencia },
  { clave: "variables", texto: "IV y WoE", calculo: "variables", usaPoblacion: true, Componente: ({ ultimo }) => <PestanaVariables resultado={ultimo("variables")} /> },
  { clave: "tramos", texto: "Laboratorio de tramos", usaPoblacion: true, Componente: PestanaTramos },
  { clave: "significancia", texto: "Explorador de significancia", usaPoblacion: true, Componente: PestanaSignificancia },
];

export default function LaboratorioEstadistica() {
  return (
    <ModuloDelCorte
      titulo="Descubrimiento estadístico"
      descripcion="¿Qué anticipa el impago? Descriptivas, distribuciones, faltantes, correlaciones, pruebas y valor de información de cada variable del perfil."
      pestanas={PESTANAS_ESTADISTICA}
      poblacionPorDefecto="solicitudes"
    />
  );
}
