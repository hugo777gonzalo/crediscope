// Un campo numérico grande, con su prefijo ("$") o sufijo ("meses", "%")
// a la vista. Lo usan el formulario del crédito y el Ingreso declarado. Si el
// campo ya tiene su <label>, no lleva etiquetaAccesible: un nombre distinto del
// que se ve (como «Monto del crédito» contra «¿Cuánto necesita?») confunde a
// quien usa un lector de pantalla o dicta por voz.
export default function EntradaDeMonto({ id, prefijo = null, sufijo = null, valor, alCambiar, modo = "decimal", etiquetaAccesible, marcador = "", invalido = false }) {
  return (
    <div className={`crediscope-credito-entrada${invalido ? " crediscope-credito-entrada-invalida" : ""}`}>
      {prefijo ? <span aria-hidden="true">{prefijo}</span> : null}
      <input
        id={id}
        inputMode={modo}
        value={valor}
        placeholder={marcador}
        onChange={(e) => alCambiar(e.target.value)}
        aria-label={etiquetaAccesible}
        aria-invalid={invalido || undefined}
        autoComplete="off"
      />
      {sufijo ? <span aria-hidden="true">{sufijo}</span> : null}
    </div>
  );
}
