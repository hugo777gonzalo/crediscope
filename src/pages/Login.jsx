import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";
import LogoMark from "../components/LogoMark.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError(authError.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : authError.message);
      return;
    }
    navigate("/");
  }

  if (!isSupabaseConfigured) {
    return (
      <div className="crediscope-card">
        <h2>Supabase no configurado</h2>
        <p className="crediscope-muted">
          Define <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en{" "}
          <code>.env</code> (ver <code>.env.example</code>) para habilitar el login.
        </p>
      </div>
    );
  }

  return (
    <div className="crediscope-auth-shell">
      <div className="crediscope-auth-card">
        <div className="crediscope-auth-brand">
          <LogoMark size={44} />
        </div>
        <h1 className="crediscope-auth-title">Bienvenido de vuelta</h1>
        <p className="crediscope-auth-subtitle">Ingresá con tu correo para continuar en CrediScope.</p>

        <form onSubmit={handleSubmit} className="crediscope-auth-form">
          <label className="crediscope-auth-label" htmlFor="login-email">
            Correo
          </label>
          <input
            id="login-email"
            className="crediscope-input"
            type="email"
            placeholder="correo@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <label className="crediscope-auth-label" htmlFor="login-password">
            Contraseña
          </label>
          <input
            id="login-password"
            className="crediscope-input"
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {error ? <p className="crediscope-auth-error">{error}</p> : null}
          <button className="crediscope-btn crediscope-auth-submit" type="submit" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p className="crediscope-auth-footer">
          ¿No tenés cuenta? <Link to="/crear-cuenta">Creá una</Link>
        </p>
      </div>
    </div>
  );
}
