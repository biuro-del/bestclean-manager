import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export default function Login() {
  const { isAuthenticated, login, loading, authMessage, requestPasswordReset } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [resetting, setResetting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    setInfo("");
    try {
      await login({ identifier, password });
    } catch (err) {
      setError(String(err?.message || "Blad logowania."));
    }
  }

  async function onForgotPassword() {
    setError("");
    setInfo("");
    setResetting(true);
    try {
      await requestPasswordReset({ identifier });
      setInfo("Jesli konto istnieje, wyslalismy link resetu hasla.");
    } catch (err) {
      setError(String(err?.message || "Nie udalo sie wyslac linku resetu."));
    } finally {
      setResetting(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "40px auto" }}>
      <h1>Logowanie</h1>
      <p>Zaloguj sie loginem lub e-mailem.</p>

      {authMessage ? <p style={{ color: "#b91c1c" }}>{authMessage}</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {info ? <p style={{ color: "#166534" }}>{info}</p> : null}

      <form onSubmit={onSubmit}>
        <label htmlFor="identifier">Login lub e-mail</label>
        <input
          id="identifier"
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          required
          style={{ display: "block", width: "100%", margin: "8px 0 16px", padding: 10 }}
        />

        <label htmlFor="password">Haslo</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          style={{ display: "block", width: "100%", margin: "8px 0 16px", padding: 10 }}
        />

        <button type="submit" disabled={loading} style={{ padding: "10px 14px" }}>
          {loading ? "Logowanie..." : "Zaloguj"}
        </button>
        <button
          type="button"
          disabled={resetting}
          onClick={onForgotPassword}
          style={{ marginLeft: 8, padding: "10px 14px" }}
        >
          {resetting ? "Wysylanie..." : "Zapomnialem hasla"}
        </button>
      </form>
    </main>
  );
}
