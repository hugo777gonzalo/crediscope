import { TrendingUp, Activity, ListChecks, Building2, CreditCard, Search, Ban, Users, MapPin, Database } from "lucide-react";
import { TituloTarjeta, FilaCampo } from "../reporte/Piezas.jsx";

// Lo que queda del informe de Aval después de lo que se ve siempre: se
// consulta cuando hace falta, no se barre en cada cliente. Por eso va
// detrás de "Ver reporte total".
//
// Los rótulos son de esta pantalla y no las descripciones de ESPEC: ESPEC
// le habla al admin y al marco interpretativo ("NO se manda al LLM",
// "agregado de Aval, incluye..."), y acá lee un analista.
//
// Contacto trae dato en 13 de las 240 personas del pool; una sección sin
// ningún campo no se dibuja, en vez de mostrar una tarjeta vacía.

export const SECCIONES = [
  {
    titulo: "Tendencia de deuda",
    Icono: TrendingUp,
    campos: [
      ["mesesConHistoriaDeuda", "entero", "Meses con historia de deuda"],
      ["deudaPromedioHistorica", "dinero", "Deuda promedio de la serie"],
      ["endeudamientoPromedioPrevio", "dinero", "Promedio antes de los últimos 3 meses"],
      ["endeudamientoReciente3m", "dinero", "Promedio de los últimos 3 meses"],
      ["variacionEndeudamientoReciente", "dinero", "Variación reciente (nuevo endeudamiento)"],
      ["deudaHace12m", "dinero", "Deuda hace 12 meses"],
      ["deudaHace24m", "dinero", "Deuda hace 24 meses"],
      ["maxDeudaHistorica", "dinero", "Máxima deuda de la serie"],
      ["mesesConVencido", "entero", "Meses con saldo vencido", true],
      ["maxVencidoHistorico", "dinero", "Máximo saldo vencido", true],
    ],
  },
  {
    titulo: "Comportamiento de pago (36 meses)",
    Icono: Activity,
    campos: [
      ["saldoPromedio36M", "dinero", "Saldo promedio"],
      ["saldoPromedioTarjetas36M", "dinero", "Saldo promedio en tarjetas"],
      ["maxMontoDeuda36M", "dinero", "Máximo monto de deuda"],
      ["maySaldoVencidoDirecta36M", "dinero", "Mayor saldo vencido directo", true],
      ["peorEdadVencidoDirecta36M", "texto", "Peor edad de vencido"],
      // Para Aval, null acá quiere decir "ninguno" (ver ESPEC): es un dato.
      ["fechaUltimoVencido", "fecha", "Último vencido", false, "Ninguno"],
    ],
  },
  {
    titulo: "Operaciones",
    Icono: ListChecks,
    nota: "Conteos de Aval, que no los separa por rol: incluyen las operaciones como codeudor/garante.",
    campos: [
      ["nOpBancos", "entero", "En bancos"],
      ["nOpCooperativas", "entero", "En cooperativas"],
      ["nOpComercial", "entero", "Comerciales"],
      ["nOpServicios", "entero", "De servicios"],
      ["nOpCobranza", "entero", "En cobranza", true],
      ["nTarjetasActivas", "entero", "Tarjetas activas"],
      ["numTarjetasVigentes", "entero", "Tarjetas vigentes (indicador)"],
      ["nOpHistoricas", "entero", "Históricas, todos los sistemas"],
    ],
  },
  {
    titulo: "Acreedores",
    Icono: Building2,
    campos: [
      ["nAcreedores", "entero", "Acreedores con saldo"],
      ["acreedorPrincipal", "texto", "Acreedor principal"],
      ["participacionAcreedorPrincipal", "decimal", "Parte de la deuda que concentra"],
    ],
  },
  {
    titulo: "Tarjetas de crédito",
    Icono: CreditCard,
    campos: [
      ["cupoTotalTarjetas", "dinero", "Cupo total"],
      ["consumoTotalTarjetas", "dinero", "Consumo"],
      ["saldoTotalTarjetas", "dinero", "Saldo"],
    ],
  },
  {
    titulo: "Consultas al buró (12 meses)",
    Icono: Search,
    // Medido el 2026-09-23: nuestras consultas figuran en la lista como las
    // de cualquier otra entidad. Sin la aclaración, un cliente que miramos
    // cuatro veces parece estar pidiendo crédito en todos lados.
    nota: "Incluye nuestras propias consultas (NOVACREDIT): cada vez que se la consulta desde acá, suma.",
    campos: [
      ["consultas12m", "entero", "Consultas"],
      ["entidadesDistintas12m", "entero", "Entidades distintas"],
      ["ultimaConsulta", "fecha", "Última consulta"],
    ],
  },
  { titulo: "Cuentas corrientes", Icono: Ban, campos: [] },
  {
    titulo: "Relaciones",
    Icono: Users,
    campos: [
      ["nEmpresasRelacionadas", "entero", "Empresas donde es accionista o administrador"],
      ["esRUC", "booleano", "Tiene RUC personal"],
    ],
  },
  {
    titulo: "Contacto",
    Icono: MapPin,
    campos: [
      ["telefono", "texto", "Teléfono celular"],
      ["ciudad", "texto", "Ciudad"],
      ["sectorContacto", "texto", "Sector"],
      ["direccion", "texto", "Dirección"],
      ["numeracion", "texto", "Numeración"],
    ],
  },
  {
    titulo: "Datos de la consulta",
    Icono: Database,
    campos: [
      ["responseCode", "texto", "Código de respuesta"],
      ["transactionNumber", "texto", "Nº de transacción"],
      ["nSegmentosConDatos", "entero", "Segmentos con datos (de 34)"],
      ["tieneHistorialCrediticio", "booleano", "Tiene historial crediticio"],
      ["version", "texto", "Versión de la estructura"],
    ],
  },
];

const tieneDato = (v) => v !== null && v !== undefined;

// Cuántas tarjetas se van a dibujar, para que el botón diga qué esconde.
// El "Ninguno" de fechaUltimoVencido no alcanza para dibujar la sección:
// si Aval no mandó ningún indicador de deuda, ese null no es "ninguno", es
// que no hay segmento.
export function seccionesConDatos(estructura) {
  return SECCIONES.filter((s) => s.titulo === "Cuentas corrientes" || s.campos.some(([campo]) => tieneDato(estructura[campo])));
}

function CuentasCorrientes({ e }) {
  if (!e.inhabilitadoCtaCte) {
    return <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>Sin inhabilitación registrada.</p>;
  }
  return (
    <>
      <span className="crediscope-tag crediscope-tag-bad" style={{ display: "inline-block", marginBottom: 10 }}>
        Inhabilitado para cuentas corrientes
      </span>
      <ul className="crediscope-aval-filas">
        <FilaCampo etiqueta="Motivo" valor={e.ctaCte_motivo} tipo="texto" />
        <FilaCampo etiqueta="Tiempo de inhabilitación" valor={e.ctaCte_tiempoInhabilitado} tipo="texto" />
        <FilaCampo etiqueta="Desde" valor={e.ctaCte_fechaInhabilitado} tipo="fecha" />
        <FilaCampo etiqueta="Hasta" valor={e.ctaCte_fechaCumplimientoSancion} tipo="fecha" />
        <FilaCampo etiqueta="Acción" valor={e.ctaCte_accion} tipo="texto" />
      </ul>
    </>
  );
}

export default function ReporteTotal({ estructura: e }) {
  return (
    <div className="crediscope-aval-reporte">
      {seccionesConDatos(e).map((s) => (
        <div key={s.titulo} className="crediscope-card">
          <TituloTarjeta Icono={s.Icono}>{s.titulo}</TituloTarjeta>
          {s.titulo === "Cuentas corrientes" ? (
            <CuentasCorrientes e={e} />
          ) : (
            <ul className="crediscope-aval-filas">
              {s.campos.map(([campo, tipo, etiqueta, alerta, siFalta]) => (
                <FilaCampo key={campo} etiqueta={etiqueta} valor={e[campo]} tipo={tipo} alerta={alerta} siFalta={siFalta} />
              ))}
            </ul>
          )}
          {s.nota ? <p className="crediscope-aval-nota">{s.nota}</p> : null}
        </div>
      ))}
    </div>
  );
}
