"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";

interface PendingAction {
  id: string;
  run_id: string;
  tool_name: string;
  input: Record<string, any>;
  status: string;
  created_at: string;
}

export default function PendingActionsPage() {
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActions();
  }, []);

  const fetchActions = async () => {
    try {
      const res = await fetch("http://localhost:3000/api/v1/admin/pending-actions");
      const data = await res.json();
      setActions(data);
    } catch (err) {
      console.error("Error fetching actions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await fetch(`http://localhost:3000/api/v1/admin/pending-actions/${id}/approve`, {
        method: "POST"
      });
      // Remove from list
      setActions(actions.filter(a => a.id !== id));
    } catch (err) {
      console.error("Error approving action:", err);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Aprobaciones Pendientes</h1>
        <p style={{ color: 'var(--text-muted)' }}>Revisa y aprueba las acciones críticas que Pita Dixital quiere realizar.</p>
      </header>

      {loading ? (
        <p>Cargando acciones...</p>
      ) : actions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }}>
          <span style={{ fontSize: '3rem' }}>🎉</span>
          <h3 style={{ marginTop: '1rem', color: 'var(--foreground)' }}>No tienes tareas pendientes</h3>
          <p style={{ color: 'var(--text-muted)' }}>El bot está funcionando en modo autónomo y no requiere tu intervención.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {actions.map(action => (
            <div key={action.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>
                  <span>{action.tool_name === 'google_calendar_schedule' ? '🗓️' : action.tool_name === 'google_gmail_send' ? '📧' : '⚙️'}</span>
                  Ejecutar: {action.tool_name}
                </h3>
                <span className={styles.badge}>{action.status}</span>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Creado: {new Date(action.created_at).toLocaleString()}
              </p>
              <div className={styles.inputData}>
                {JSON.stringify(action.input, null, 2)}
              </div>
              <div className={styles.actions}>
                <button className={styles.rejectBtn} onClick={() => setActions(actions.filter(a => a.id !== action.id))}>Rechazar</button>
                <button className={styles.approveBtn} onClick={() => handleApprove(action.id)}>Aprobar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
