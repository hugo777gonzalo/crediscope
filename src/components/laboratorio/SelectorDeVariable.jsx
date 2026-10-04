// Un desplegable de variables del corte, agrupadas por tema del perfil. Las
// que el modelo no recibe y las protegidas van marcadas en el nombre.
export default function SelectorDeVariable({ columnas, valor, alCambiar, filtro = () => true }) {
  const grupos = new Map();
  for (const c of columnas.filter(filtro)) grupos.set(c.grupo, [...(grupos.get(c.grupo) ?? []), c]);
  return (
    <select value={valor ?? ""} onChange={(e) => alCambiar(e.target.value)} className="crediscope-input" style={{ width: "auto", maxWidth: "100%" }}>
      {[...grupos.entries()].map(([grupo, cs]) => (
        <optgroup key={grupo} label={grupo}>
          {cs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}{c.uso === "protegida" ? " · protegida" : !c.enModelo ? " · el modelo no la recibe" : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
