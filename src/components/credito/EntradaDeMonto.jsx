// Un campo numérico grande, con su prefijo ("$") o sufijo ("meses", "%")
// a la vista. Lo usan el formulario del crédito y el Ingreso declarado.
export default function EntradaDeMonto({ id, prefijo = null, sufijo = null, valor, alCambiar, modo = "decimal", etiquetaAccesible, marcador = "" }) {
  return (
    <div className="crediscope-credito-entrada">
      {prefijo ? <span aria-hidden="true">{prefijo}</span> : null}
      <input
        id={id}
        inputMode={modo}
        value={valor}
        placeholder={marcador}
        onChange={(e) => alCambiar(e.target.value)}
        aria-label={etiquetaAccesible}
        autoComplete="off"
      />
      {sufijo ? <span aria-hidden="true">{sufijo}</span> : null}
    </div>
  );
}
