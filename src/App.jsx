import { Routes, Route, Link, Navigate } from "react-router-dom"
import { useAuth } from "./auth/useAuth"
import ProtectedRoute from "./components/ProtectedRoute"
import Dashboard from "./pages/Dashboard"
import Scan from "./pages/Scan"
import Stop from "./pages/Stop"
import Login from "./pages/Login"

function App() {
  const { isAuthenticated, user, logout } = useAuth()

  return (
    <div style={{ padding: 40 }}>
      <h1>Best Clean System</h1>

      {isAuthenticated ? (
        <>
          <p>Zalogowany: {user?.email}</p>
          <nav style={{ marginBottom: 20 }}>
            <Link to="/">Dashboard</Link> |{" "}
            <Link to="/scan">Skanuj</Link> |{" "}
            <Link to="/stop">Stop</Link> |{" "}
            <button onClick={logout} style={{ marginLeft: 8 }}>Wyloguj</button>
          </nav>
        </>
      ) : null}

      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={(
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/scan"
          element={(
            <ProtectedRoute>
              <Scan />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/stop"
          element={(
            <ProtectedRoute>
              <Stop />
            </ProtectedRoute>
          )}
        />
        <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
      </Routes>
    </div>
  )
}

export default App
