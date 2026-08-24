import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.dashboardGrid}>
      {/* Agentes & Autoconfig (Main Card) */}
      <Link href="/clients" className={`${styles.card} ${styles.cardDark}`} style={{ gridColumn: 'span 6', textDecoration: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
        <h2 className={styles.cardTitle} style={{ marginBottom: '1rem', fontSize: '1.4rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>🤖 Agentes & Autoconfig</span>
          <span>→</span>
        </h2>
        <p style={{ color: 'var(--text-muted-on-dark)', lineHeight: 1.6, flex: 1 }}>
          Configura el motor ReAct, gestiona prompts y ajusta los parámetros del LLM en tiempo real.
        </p>
        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
          <div className={styles.miniCard} style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-on-dark)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h4 style={{ fontSize: '1.2rem' }}>Activos</h4>
            <p style={{ color: 'var(--text-muted-on-dark)' }}>2</p>
          </div>
          <div className={styles.miniCard} style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-on-dark)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h4 style={{ fontSize: '1.2rem' }}>Tokens/M</h4>
            <p style={{ color: 'var(--text-muted-on-dark)' }}>12.4k</p>
          </div>
        </div>
      </Link>

      {/* Memoria Semántica */}
      <div className={`${styles.card} ${styles.cardLight}`} style={{ gridColumn: 'span 6', display: 'flex', flexDirection: 'column' }}>
        <h2 className={styles.cardTitle} style={{ marginBottom: '1rem', fontSize: '1.4rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>🧠 Memoria Semántica</span>
          <span className={styles.taskIconBtn} style={{ background: 'transparent', color: 'var(--foreground)' }}>⋮</span>
        </h2>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, flex: 1 }}>
          Explora los hechos extraídos de las conversaciones y el historial de interacciones a largo plazo.
        </p>
        <div style={{ marginTop: '2rem', padding: '1rem', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Hechos Recientes</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>Ver todo</span>
          </div>
          <ul style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <li>• El cliente prefiere contacto por WhatsApp.</li>
            <li>• Buscando información sobre rediseño UI.</li>
          </ul>
        </div>
      </div>

      {/* Observabilidad (LLMOps) */}
      <div className={`${styles.card} ${styles.cardLight}`} style={{ gridColumn: 'span 12', marginTop: '1rem' }}>
        <h2 className={styles.cardTitle} style={{ marginBottom: '1rem', fontSize: '1.4rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>📊 Observabilidad (LLMOps)</span>
          <span className={styles.taskIconBtn} style={{ background: 'transparent', color: 'var(--foreground)' }}>📈</span>
        </h2>
        <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '600px' }}>
          Monitoriza los costes, latencias, y visualiza el razonamiento (trazas) de los agentes ReAct en tiempo real.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginTop: '2rem' }}>
          <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Latencia Media</span>
            <span style={{ fontSize: '2rem', fontWeight: 600 }}>1.2s</span>
          </div>
          <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Tasa de Éxito Tools</span>
            <span style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--success)' }}>98.5%</span>
          </div>
          <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Coste Estimado / Mes</span>
            <span style={{ fontSize: '2rem', fontWeight: 600 }}>$14.20</span>
          </div>
        </div>
      </div>
    </div>
  );
}
