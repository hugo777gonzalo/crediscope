import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../lib/supabaseClient.js";

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
      setError(authError.message);
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
    <div className="crediscope-card" style={{ maxWidth: 360 }}>
      <h2>Acceso analistas</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          className="crediscope-input"
          type="email"
          placeholder="correo@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="crediscope-input"
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? <p style={{ color: "var(--bad)", fontSize: 14 }}>{error}</p> : null}
        <button className="crediscope-btn" type="submit" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
