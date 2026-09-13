import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";
import LogoMark from "../components/LogoMark.jsx";

const LARGO_CODIGO = 6;

// Crear cuenta pública, en 2 pasos -- a pedido del usuario, verificación
// de correo con un código (como Netflix/Disney+), no un link mágico.
// Requiere 2 cambios de configuración en el dashboard de Supabase que
// no se pueden hacer por código (ver 024_signup_publico.sql): "Confirm
// email" activado, y el template de "Confirm signup" mostrando
// {{ .Token }}. El rol siempre queda "analista" -- lo fuerza el
// trigger de la base (handle_new_user), nunca este formulario.
function CampoCodigo({ valor, onChange }) {
  const refs = useRef([]);

  function actualizarDigito(i, char) {
    const limpio = char.replace(/\D/g, "").slice(-1);
    const nuevo = valor.split("");
    nuevo[i] = limpio;
    const siguiente = nuevo.join("").padEnd(LARGO_CODIGO, " ").slice(0, LARGO_CODIGO);
    onChange(siguiente.trimEnd());
    if (limpio && i < LARGO_CODIGO - 1) refs.current[i + 1]?.focus();
  }

  function manejarTeclado(i, e) {
    if (e.key === "Backspace" && !valor[i] && i > 0) refs.current[i - 1]?.focus();
  }

  function manejarPegado(e) {
    e.preventDefault();
    const pegado = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LARGO_CODIGO);
    onChange(pegado);
    refs.current[Math.min(pegado.length, LARGO_CODIGO - 1)]?.focus();
  }

  return (
    <div className="crediscope-otp-row" onPaste={manejarPegado}>
      {Array.from({ length: LARGO_CODIGO }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          className="crediscope-otp-digit"
          inputMode="numeric"
          maxLength={1}
          value={valor[i] ?? ""}
          onChange={(e) => actualizarDigito(i, e.target.value)}
          onKeyDown={(e) => manejarTeclado(i, e)}
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
}

export default function Signup() {
  const [paso, setPaso] = useState("datos");
  const [email, setEmail] = useState("");
  const [nombreCorto, setNombreCorto] = useState("");
  const [entidad, setEntidad] = useState("");
  const [password, setPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const navigate = useNavigate();

  async function handleSubmitDatos(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmarPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre_corto: nombreCorto.trim(), entidad: entidad.trim() } },
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError("Ya existe una cuenta con ese correo. Iniciá sesión en vez de crear una nueva.");
      return;
    }
    setPaso("verificar");
  }

  async function handleSubmitCodigo(e) {
    e.preventDefault();
    setError(null);
    if (codigo.length !== LARGO_CODIGO) {
      setError(`Ingresá los ${LARGO_CODIGO} dígitos del código.`);
      return;
    }
    setLoading(true);
    const { error: otpError } = await supabase.auth.verifyOtp({ email, token: codigo, type: "signup" });
    setLoading(false);
    if (otpError) {
      setError("Código incorrecto o vencido. Pedí uno nuevo si hace falta.");
      return;
    }
    navigate("/");
  }

  async function handleReenviar() {
    setReenviando(true);
    setError(null);
    setMensaje(null);
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
    setReenviando(false);
    if (resendError) {
      setError(resendError.message);
      return;
    }
    setMensaje("Te reenviamos el código.");
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="crediscope-card">
        <h2>Supabase no configurado</h2>
      </div>
    );
  }

  return (
    <div className="crediscope-auth-shell">
      <div className="crediscope-auth-card">
        <div className="crediscope-auth-brand">
          <LogoMark size={44} />
        </div>

        {paso === "datos" ? (
          <>
            <h1 className="crediscope-auth-title">Creá tu cuenta</h1>
            <p className="crediscope-auth-subtitle">Analítica avanzada con IA para crédito — te vamos a pedir verificar tu correo.</p>
            <form onSubmit={handleSubmitDatos} className="crediscope-auth-form">
              <label className="crediscope-auth-label" htmlFor="signup-email">
                Correo
              </label>
              <input
                id="signup-email"
                className="crediscope-input"
                type="email"
                placeholder="correo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
              <label className="crediscope-auth-label" htmlFor="signup-nombre">
                Nombre corto (como querés que te vean)
              </label>
              <input
                id="signup-nombre"
                className="crediscope-input"
                type="text"
                placeholder="Ej. Hugo Pichucho"
                value={nombreCorto}
                onChange={(e) => setNombreCorto(e.target.value)}
                autoComplete="name"
                required
              />
              <label className="crediscope-auth-label" htmlFor="signup-entidad">
                Entidad financiera (opcional)
              </label>
              <input
                id="signup-entidad"
                className="crediscope-input"
                type="text"
                placeholder="Ej. Cooperativa X"
                value={entidad}
                onChange={(e) => setEntidad(e.target.value)}
              />
              <label className="crediscope-auth-label" htmlFor="signup-password">
                Contraseña
              </label>
              <input
                id="signup-password"
                className="crediscope-input"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <label className="crediscope-auth-label" htmlFor="signup-password-confirm">
                Confirmar contraseña
              </label>
              <input
                id="signup-password-confirm"
                className="crediscope-input"
                type="password"
                placeholder="Repetí la contraseña"
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              {error ? <p className="crediscope-auth-error">{error}</p> : null}
              <button className="crediscope-btn crediscope-auth-submit" type="submit" disabled={loading}>
                {loading ? "Creando cuenta..." : "Crear cuenta"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="crediscope-auth-title">Verificá tu correo</h1>
            <p className="crediscope-auth-subtitle">
              Te enviamos un código de {LARGO_CODIGO} dígitos a <strong>{email}</strong>.
            </p>
            <form onSubmit={handleSubmitCodigo} className="crediscope-auth-form">
              <CampoCodigo valor={codigo} onChange={setCodigo} />
              {error ? <p className="crediscope-auth-error">{error}</p> : null}
              {mensaje ? <p className="crediscope-auth-mensaje">{mensaje}</p> : null}
              <button className="crediscope-btn crediscope-auth-submit" type="submit" disabled={loading}>
                {loading ? "Verificando..." : "Confirmar código"}
              </button>
              <button type="button" className="crediscope-btn crediscope-btn-ghost" onClick={handleReenviar} disabled={reenviando}>
                {reenviando ? "Reenviando..." : "Reenviar código"}
              </button>
            </form>
          </>
        )}

        <p className="crediscope-auth-footer">
          ¿Ya tenés cuenta? <Link to="/login">Ingresá</Link>
        </p>
      </div>
    </div>
  );
}
