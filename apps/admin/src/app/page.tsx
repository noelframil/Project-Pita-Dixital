"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  // Cifras reales del backend. La plantilla traía valores fijos —1.402 chunks,
  // 14,20 EUR de gasto— que no salían de ningún sitio.
  const [datos, setDatos] = useState<any>(null);
  useEffect(() => {
    fetch("/api/v1/admin/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then(setDatos)
      .catch(() => setDatos(null));
  }, []);
  const n = (v: unknown, alt = "—") => (v === null || v === undefined ? alt : String(v));

  return (
    <div className={styles.dashboardGrid}>
      {/* Header / Intro */}
      <div style={{ gridColumn: 'span 12', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <span style={{ fontSize: '2.5rem' }}>🌐</span>
          Command Center
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginTop: '0.5rem' }}>
          Centro de control del orquestador ReAct y arquitectura Multi-Agente.
        </p>
      </div>

      {/* Top row: Key Metrics */}
      <div className={`${styles.card} ${styles.cardDark}`} style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '2rem', background: 'linear-gradient(135deg, var(--surface-dark), #0f1115)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--text-muted-on-dark)', textTransform: 'uppercase' }}>Estado Global</h3>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }}></span>
        </div>
        <div style={{ margin: '2rem 0' }}>
          <span style={{ fontSize: '3.5rem', fontWeight: 600, color: 'var(--text-on-dark)' }}>En Línea</span>
        </div>
        <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted-on-dark)' }}>Latencia Media</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 500, color: 'var(--text-on-dark)' }}>{datos?.ultimas_24h?.latencia_ms ? `${datos.ultimas_24h.latencia_ms} ms` : "—"}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted-on-dark)' }}>Tokens / H</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 500, color: 'var(--text-on-dark)' }}>{datos ? n(datos.ultimas_24h?.tokens) : "…"}</div>
          </div>
        </div>
      </div>

      <Link href="/subagents" className={`${styles.card} ${styles.cardLight}`} style={{ gridColumn: 'span 4', textDecoration: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)', borderRadius: '50%' }}></div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          🧠 Subagentes Expertos
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, flex: 1 }}>
          Arquitectura multi-agente activa. El orquestador está delegando tareas a los especialistas.
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: '1rem' }}>
          <span style={{ fontSize: '3rem', fontWeight: 600, lineHeight: 1 }}>{datos ? n(datos.subagentes) : "…"}</span>
          <span style={{ color: 'var(--primary)', fontWeight: 500, fontSize: '0.9rem' }}>Gestionar &rarr;</span>
        </div>
      </Link>

      <Link href="/integrations" className={`${styles.card} ${styles.cardLight}`} style={{ gridColumn: 'span 4', textDecoration: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-20%', right: '-10%', width: '150px', height: '150px', background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)', borderRadius: '50%' }}></div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          🔌 Integraciones
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, flex: 1 }}>
          Webhooks y Function Calling conectados. El bot puede ejecutar acciones en el mundo real.
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: '1rem' }}>
          <span style={{ fontSize: '3rem', fontWeight: 600, lineHeight: 1 }}>{datos ? n(datos.herramientas) : "…"}</span>
          <span style={{ color: 'var(--primary)', fontWeight: 500, fontSize: '0.9rem' }}>Configurar &rarr;</span>
        </div>
      </Link>

      {/* Bottom row: Memory and LLMOps */}
      <Link href="/memory" className={`${styles.card} ${styles.cardLight}`} style={{ gridColumn: 'span 6', textDecoration: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📚 Memoria Semántica (RAG)
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Base de conocimiento indexada (PGVector + FTS).
            </p>
          </div>
          <span style={{ fontSize: '2.5rem' }}>📄</span>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--radius-md)', padding: '1.5rem', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Chunks Vectorizados</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 600, color: 'var(--foreground)' }}>{datos ? n(datos.conocimiento) : "…"}</div>
          </div>
          <span style={{ color: 'var(--primary)', fontWeight: 500, fontSize: '0.9rem' }}>Actualizar &rarr;</span>
        </div>
      </Link>

      <Link href="/llmops" className={`${styles.card} ${styles.cardLight}`} style={{ gridColumn: 'span 6', textDecoration: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              📊 Observabilidad (LLMOps)
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Gasto acumulado y trazas del modelo en tiempo real.
            </p>
          </div>
          <span style={{ fontSize: '2.5rem' }}>📈</span>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--radius-md)', padding: '1.5rem', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Gasto Mensual</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 600, color: 'var(--foreground)' }}>{datos ? `${n(datos.coste_eur)} €` : "…"}</div>
          </div>
          <span style={{ color: 'var(--primary)', fontWeight: 500, fontSize: '0.9rem' }}>Ver Trazas &rarr;</span>
        </div>
      </Link>
    </div>
  );
}
