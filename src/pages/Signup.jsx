import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";
import { useSession } from "../lib/useSession.js";
import LogoMark from "../components/LogoMark.jsx";

// Crear cuenta pública, en 2 pasos. Idealmente el paso 2 verifica el
// correo con un código de 6 dígitos (como Netflix/Disney+) -- ESO
// QUEDÓ PENDIENTE: Supabase no deja editar el contenido de sus
// plantillas de correo (para mostrar {{ .Token }} en vez de un link)
// salvo que se configure SMTP propio (Project Settings > Authentication
// > SMTP Settings, ej. Resend). Mientras tanto el paso 2 es un simple
// "revisá tu correo y hacé click en el link" -- Supabase redirige de
// vuelta a esta app (ver Site URL en Authentication > URL Configuration,
// tiene que apuntar acá, no al localhost:3000 por defecto) y
// supabase-js detecta la sesión sola desde el link, incluso si se abrió
// en otra pestaña (sincroniza sesión entre pestañas vía localStorage).
// Cuando se configure SMTP, reintroducir el campo de código acá (ver
// historial de este archivo) y agregar {{ .Token }} al template de
// "Confirm signup".
export default function Signup() {
  const [paso, setPaso] = useState("datos");
  const [email, setEmail] = useState("");
  const [nombreCorto, setNombreCorto] = useState("");
  const [entidad, setEntidad] = useState("");
  const [password, setPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const { session } = useSession();
  const navigate = useNavigate();

  // Si el usuario confirma el correo haciendo click en el link (en esta
  // misma pestaña o en otra -- supabase-js sincroniza sesión entre
  // pestañas vía localStorage), la sesión se activa sola y hay que
  // sacarlo de esta pantalla de espera.
  useEffect(() => {
    if (paso === "verificar" && session) navigate("/");
  }, [paso, session, navigate]);

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
    setMensaje("Te reenviamos el correo.");
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
            <div className="crediscope-auth-icon-circle">
              <Mail size={26} />
            </div>
            <h1 className="crediscope-auth-title">Revisá tu correo</h1>
            <p className="crediscope-auth-subtitle">
              Te enviamos un mail a <strong>{email}</strong> con un link para confirmar tu cuenta. Abrilo desde este mismo navegador —
              al confirmar, esta pantalla te va a llevar sola a CrediScope.
            </p>
            {error ? <p className="crediscope-auth-error">{error}</p> : null}
            {mensaje ? <p className="crediscope-auth-mensaje">{mensaje}</p> : null}
            <button type="button" className="crediscope-btn crediscope-btn-ghost crediscope-auth-submit" onClick={handleReenviar} disabled={reenviando}>
              {reenviando ? "Reenviando..." : "Reenviar correo"}
            </button>
          </>
        )}

        <p className="crediscope-auth-footer">
          ¿Ya tenés cuenta? <Link to="/login">Ingresá</Link>
        </p>
      </div>
    </div>
  );
}
