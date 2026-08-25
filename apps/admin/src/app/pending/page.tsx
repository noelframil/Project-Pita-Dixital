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

  const getIcon = (toolName: string) => {
    switch (toolName) {
      case 'google_calendar_schedule': return '🗓️';
      case 'google_gmail_send': return '📧';
      case 'browser_agent': return '🌐';
      case 'code_interpreter': return '💻';
      case 'save_to_memory': return '🧠';
      default: return '⚙️';
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <span style={{ fontSize: '3rem' }}>🛡️</span> 
          Aprobaciones Pendientes
        </h1>
        <p className={styles.subtitle}>
          Revisa y autoriza las acciones críticas que el agente requiere ejecutar. Esta es la barrera de seguridad (Human-in-the-Loop) antes de afectar al mundo real.
        </p>
      </header>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className={styles.badge}>Sincronizando con el orquestador...</div>
        </div>
      ) : actions.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🎉</div>
          <h3 className={styles.emptyTitle}>Sistemas Despejados</h3>
          <p className={styles.emptyText}>
            El agente está operando de forma autónoma. No hay acciones críticas pendientes de revisión manual.
          </p>
        </div>
      ) : (
        <div className={styles.grid}>
          {actions.map(action => (
            <div key={action.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <div className={styles.iconWrapper}>
                    {getIcon(action.tool_name)}
                  </div>
                  {action.tool_name}
                </div>
                <span className={styles.badge}>{action.status}</span>
              </div>
              
              <div className={styles.timestamp}>
                <span>⏱️</span>
                {new Date(action.created_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>

              <div className={styles.inputDataWrapper}>
                <div className={styles.inputDataHeader}>Parámetros de Entrada (JSON)</div>
                <div className={styles.inputData}>
                  {JSON.stringify(action.input, null, 2)}
                </div>
              </div>

              <div className={styles.actions}>
                <button 
                  className={`${styles.btn} ${styles.rejectBtn}`} 
                  onClick={() => setActions(actions.filter(a => a.id !== action.id))}
                >
                  <span>✕</span> Rechazar
                </button>
                <button 
                  className={`${styles.btn} ${styles.approveBtn}`} 
                  onClick={() => handleApprove(action.id)}
                >
                  <span>✓</span> Aprobar Ejecución
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
