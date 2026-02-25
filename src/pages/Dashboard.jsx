import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { setAuthMessage } from "../auth/sessionStorage";
import { useAuth } from "../auth/useAuth";
import { backendApi, errorMessage, isSessionError } from "../lib/backendApi";

function formatIso(iso) {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString();
}

function formatDuration(seconds) {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total) || total <= 0) return "0 min";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

export default function Dashboard() {
  const { logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [worker, setWorker] = useState(null);
  const [workdayState, setWorkdayState] = useState({ workday: null, staleOpen: false, staleStartAt: "" });
  const [cycleState, setCycleState] = useState({ cycle: null });
  const [utility, setUtility] = useState({ utilityRoomId: "", startRoomId: "", stopRules: [] });

  const handleApiError = useCallback(async (err) => {
    const msg = errorMessage(err);
    if (isSessionError(err)) {
      setAuthMessage(msg);
      await logout();
      return;
    }
    setError(msg);
  }, [logout]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, utilityConfig, workday, cycle] = await Promise.all([
        backendApi.authMe(),
        backendApi.workdayUtilityId(),
        backendApi.workdayActive(),
        backendApi.cycleActive(),
      ]);
      setWorker(me?.worker || null);
      setUtility({
        utilityRoomId: utilityConfig?.utilityRoomId || "",
        startRoomId: utilityConfig?.startRoomId || "",
        stopRules: Array.isArray(utilityConfig?.stopRules) ? utilityConfig.stopRules : [],
      });
      setWorkdayState(workday || { workday: null, staleOpen: false, staleStartAt: "" });
      setCycleState(cycle || { cycle: null });
    } catch (err) {
      await handleApiError(err);
    } finally {
      setLoading(false);
    }
  }, [handleApiError]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  return (
    <main style={{ textAlign: "left", maxWidth: 860, margin: "0 auto" }}>
      <h2>Dashboard</h2>
      <p>Podglad aktualnego dnia pracy i aktywnego cyklu.</p>

      <p style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={refreshData} disabled={loading}>
          {loading ? "Odswiezanie..." : "Odswiez dane"}
        </button>
        <Link to="/scan">Przejdz do skanowania</Link>
        <Link to="/stop">Przejdz do STOP</Link>
      </p>

      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}

      <section>
        <h3>Uzytkownik</h3>
        {worker ? (
          <p>
            {worker.email} | login: {worker.login || "-"} | rola: {worker.role || "-"}
          </p>
        ) : (
          <p>Brak danych uzytkownika.</p>
        )}
      </section>

      <section>
        <h3>Dzien pracy</h3>
        {workdayState.workday ? (
          <>
            <p>Status: {workdayState.workday.status || "-"}</p>
            <p>Start: {formatIso(workdayState.workday.startAt)}</p>
            <p>Koniec skan: {formatIso(workdayState.workday.endScanAt)}</p>
            <p>Auto zamkniecie: {formatIso(workdayState.workday.autoCloseAt)}</p>
            <p>Czas: {formatDuration(workdayState.workday.durationSec)}</p>
          </>
        ) : workdayState.staleOpen ? (
          <p style={{ color: "#b45309" }}>
            Wykryto otwarty dzien z poprzedniego dnia ({formatIso(workdayState.staleStartAt)}).
          </p>
        ) : (
          <p>Brak aktywnego dnia pracy.</p>
        )}
      </section>

      <section>
        <h3>Cykl sprzatania</h3>
        {cycleState.cycle ? (
          <>
            <p>Status: {cycleState.cycle.status || "-"}</p>
            <p>Strefa: {cycleState.cycle.zone || "-"}</p>
            <p>Pomieszczenie: {cycleState.cycle.room || cycleState.cycle.roomId || "-"}</p>
            <p>Start: {formatIso(cycleState.cycle.startAt)}</p>
            <p>Czas: {formatDuration(cycleState.cycle.durationSec)}</p>
          </>
        ) : (
          <p>Brak aktywnego cyklu.</p>
        )}
      </section>

      <section>
        <h3>Konfiguracja START/STOP</h3>
        <p>QR START: {utility.startRoomId || utility.utilityRoomId || "-"}</p>
        {utility.stopRules.length > 0 ? (
          <ul>
            {utility.stopRules.map((rule) => (
              <li key={`${rule.roomId}_${rule.graceMinutes}`}>
                {rule.roomId}: {rule.graceMinutes} min
              </li>
            ))}
          </ul>
        ) : (
          <p>Brak dedykowanych reguł STOP.</p>
        )}
      </section>
    </main>
  );
}
