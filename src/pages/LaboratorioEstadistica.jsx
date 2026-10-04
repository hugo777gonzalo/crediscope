import ModuloDelCorte from "../components/laboratorio/ModuloDelCorte.jsx";
import PestanaVariables from "../components/laboratorio/PestanaVariables.jsx";

// Módulo 5 del negocio: Descubrimiento estadístico. ¿Qué anticipa el
// impago? Por defecto mira todas las solicitudes observadas cuando el corte
// las tiene: con sólo lo desembolsado hay ~20 malos y todo es ruido.

export const PESTANAS_ESTADISTICA = [
  { clave: "variables", texto: "IV y WoE", calculo: "variables", usaPoblacion: true, Componente: ({ ultimo }) => <PestanaVariables resultado={ultimo("variables")} /> },
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
