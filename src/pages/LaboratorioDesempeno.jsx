import { useEffect, useState } from "react";
import ModuloDelCorte from "../components/laboratorio/ModuloDelCorte.jsx";
import PestanaDesempeno from "../components/laboratorio/PestanaDesempeno.jsx";
import PestanaMatriz from "../components/laboratorio/PestanaMatriz.jsx";
import PestanaCuadrantes from "../components/laboratorio/PestanaCuadrantes.jsx";
import PestanaSimulacion from "../components/laboratorio/PestanaSimulacion.jsx";
import PestanaCasos from "../components/laboratorio/PestanaCasos.jsx";
import PestanaCalificacion from "../components/laboratorio/PestanaCalificacion.jsx";
import PestanaDiscriminacion from "../components/laboratorio/PestanaDiscriminacion.jsx";
import PestanaUmbrales from "../components/laboratorio/PestanaUmbrales.jsx";
import PestanaCosechas from "../components/laboratorio/PestanaCosechas.jsx";
import PestanaSegmentos from "../components/laboratorio/PestanaSegmentos.jsx";
import PestanaCalibracion from "../components/laboratorio/PestanaCalibracion.jsx";
import PestanaEstabilidad from "../components/laboratorio/PestanaEstabilidad.jsx";
import PestanaComparar from "../components/laboratorio/PestanaComparar.jsx";
import PestanaDecisionInstitucion from "../components/laboratorio/PestanaDecisionInstitucion.jsx";
import { getCatalogoUnaVez } from "../lib/datosDelCorte.js";

// Módulo 4 del negocio: Prueba retrospectiva y desempeño. ¿El motor ordena
// bien a buenos y malos, con qué política, y se sostiene en el tiempo?

const conSolicitudes = (c) => Boolean(c.resumen?.solicitudes);

function Simulacion({ corteId, resultados, recargar }) {
  const [catalogo, setCatalogo] = useState([]);
  useEffect(() => {
    getCatalogoUnaVez().then(setCatalogo).catch(() => setCatalogo([]));
  }, []);
  return <PestanaSimulacion corteId={corteId} catalogo={catalogo} simulaciones={resultados.filter((x) => x.tipo === "simulacion_politica")} alSimular={recargar} />;
}

export const PESTANAS_DESEMPENO = [
  { clave: "resumen", texto: "Resumen", calculo: "desempeno", Componente: ({ ultimo }) => <PestanaDesempeno resultado={ultimo("desempeno")} /> },
  { clave: "discriminacion", texto: "Discriminación", usaPoblacion: true, Componente: PestanaDiscriminacion },
  { clave: "matriz", texto: "Matriz de confusión", calculo: "matriz", Componente: ({ ultimo }) => <PestanaMatriz resultado={ultimo("matriz")} /> },
  { clave: "umbrales", texto: "Umbrales", usaPoblacion: true, Componente: PestanaUmbrales },
  { clave: "cuadrantes", texto: "Con y sin crédito", calculo: "cuadrantes", requiere: conSolicitudes, Componente: ({ ultimo }) => <PestanaCuadrantes resultado={ultimo("cuadrantes")} /> },
  { clave: "decision", texto: "Lo que decidió la institución", requiere: conSolicitudes, Componente: PestanaDecisionInstitucion },
  { clave: "cosechas", texto: "Cosechas", usaPoblacion: true, Componente: PestanaCosechas },
  { clave: "segmentos", texto: "Segmentos", usaPoblacion: true, Componente: PestanaSegmentos },
  { clave: "calibracion", texto: "Calibración", usaPoblacion: true, Componente: PestanaCalibracion },
  { clave: "estabilidad", texto: "Estabilidad", usaPoblacion: true, Componente: PestanaEstabilidad },
  { clave: "comparar", texto: "Comparar cortes", usaPoblacion: true, Componente: PestanaComparar },
  { clave: "simulacion", texto: "Simulación de política", Componente: Simulacion },
  { clave: "casos", texto: "Casos", Componente: ({ corteId, corte }) => <PestanaCasos corteId={corteId} esSintetico={corte.es_sintetico} /> },
  {
    clave: "calificacion_simulacion", texto: "Calificación de la simulación", calculo: "calificacion_simulacion",
    requiere: (c) => conSolicitudes(c) && c.es_sintetico, Componente: ({ ultimo }) => <PestanaCalificacion resultado={ultimo("calificacion_simulacion")} />,
  },
];

export default function LaboratorioDesempeno() {
  return (
    <ModuloDelCorte
      titulo="Prueba retrospectiva y desempeño"
      descripcion="¿El motor ordena bien a buenos y malos? Discriminación, umbrales, cosechas, segmentos, calibración y estabilidad sobre un corte congelado."
      pestanas={PESTANAS_DESEMPENO}
      poblacionPorDefecto="operaciones"
    />
  );
}
