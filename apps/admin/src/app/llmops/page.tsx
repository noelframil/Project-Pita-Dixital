"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../clients/page.module.css';

type Trace = {
  id: string;
  conversation_id: string;
  model: string;
  latency_ms: number;
  cost_micros: number;
  total_tokens: number;
  created_at: string;
};

type Metrics = {
  total_tokens: number;
  total_cost: number;
  avg_latency: number;
};

export default function LLMOpsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/admin/analytics/llmops')
      .then(res => res.json())
      .then(data => {
        setMetrics(data.metrics);
        setTraces(data.traces || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const formatCost = (cost: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cost);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Link href="/"
            style={{
              color: 'var(--text-muted)',
              marginBottom: '0.5rem',
              display: 'inline-block',
              fontSize: '0.9rem',
              textDecoration: 'none'
            }}>
            &larr; Volver al Dashboard
          </Link>
          <h1 className={styles.title}>Observabilidad (LLMOps)</h1>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button style={{ padding: '0.8rem 1.5rem', background: 'transparent', color: 'var(--foreground)', borderRadius: 'var(--radius-lg)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.5)', cursor: 'pointer' }}>
            Exportar CSV
          </button>
          <button className={styles.createBtn} style={{ padding: '0.8rem 1.5rem', background: 'var(--foreground)', color: 'var(--background)', borderRadius: 'var(--radius-lg)', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Ver en LangSmith
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Metrica: Coste */}
        <div style={{ gridColumn: 'span 4', background: 'var(--surface-dark)', color: 'var(--text-on-dark)', padding: '2rem', borderRadius: 'var(--radius-lg)', position: 'relative', overflow: 'hidden' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--text-muted-on-dark)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Gasto Acumulado (Mes)</h3>
          <div style={{ fontSize: '3.5rem', fontWeight: 600 }}>
            {loading ? '...' : formatCost(metrics?.total_cost || 0)}
          </div>
          <div style={{ marginTop: '1rem', width: '100%', height: '6px', background: 'rgba(255,255,255,0.2)', borderRadius: '3px' }}>
            <div style={{ width: '45%', height: '100%', background: 'var(--primary)', borderRadius: '3px' }}></div>
          </div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted-on-dark)' }}>45% del presupuesto ($30.00)</p>
        </div>

        {/* Metrica: Tokens */}
        <div style={{ gridColumn: 'span 4', background: 'var(--surface-light)', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid rgba(255,255,255,0.5)' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Tokens Procesados</h3>
          <div style={{ fontSize: '3rem', fontWeight: 600, color: 'var(--foreground)' }}>
            {loading ? '...' : (metrics?.total_tokens ? (metrics.total_tokens / 1000000).toFixed(2) + 'M' : '0')}
          </div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--success)' }}>&uarr; 12% vs. mes anterior</p>
        </div>

        {/* Metrica: Latencia */}
        <div style={{ gridColumn: 'span 4', background: 'var(--surface-light)', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', border: '1px solid rgba(255,255,255,0.5)' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Latencia Media (Time-to-First-Token)</h3>
          <div style={{ fontSize: '3rem', fontWeight: 600, color: 'var(--foreground)' }}>
            {loading ? '...' : (metrics?.avg_latency ? (metrics.avg_latency / 1000).toFixed(2) + 's' : '0s')}
          </div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Dentro del SLA (2.0s)</p>
        </div>
      </div>

      <h2 style={{ fontSize: '1.2rem', marginBottom: '1rem', fontWeight: 600 }}>Trazas Recientes (Traces)</h2>
      
      <div className={styles.tableContainer} style={{ background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Cargando telemetría...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {traces.map(trace => (
              <div key={trace.id} className={styles.tableRow} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr', alignItems: 'center', padding: '1.2rem 2rem', background: 'var(--surface-light)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.5)', transition: 'all 0.3s ease', cursor: 'pointer', boxShadow: '0 5px 15px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '32px', height: '32px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                    🤖
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Trace ID</div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{trace.id}</div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Modelo</div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{trace.model}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Latencia</div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: trace.latency_ms > 2000 ? 'var(--danger)' : 'var(--success)' }}>
                    {(trace.latency_ms / 1000).toFixed(2)}s
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tokens</div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{trace.total_tokens}</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(trace.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
