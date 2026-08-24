import Link from "next/link";
import styles from "../clients/page.module.css"; // Reusing layout

export default function LLMOpsPage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Link href="/" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'inline-block', fontSize: '0.9rem', textDecoration: 'none' }}>
            &larr; Volver al Dashboard
          </Link>
          <h1 className={styles.title}>Observabilidad (LLMOps)</h1>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem' }}>
        <div style={{ gridColumn: 'span 4', background: 'var(--surface-dark)', color: 'var(--text-on-dark)', padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--text-muted-on-dark)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Tokens Totales (Mes)</h3>
          <div style={{ fontSize: '3rem', fontWeight: 600 }}>1.2M</div>
        </div>

        <div style={{ gridColumn: 'span 4', background: 'var(--surface-light)', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Coste Total Estimado</h3>
          <div style={{ fontSize: '3rem', fontWeight: 600, color: 'var(--danger)' }}>$14.20</div>
        </div>

        <div style={{ gridColumn: 'span 4', background: 'var(--surface-light)', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Latencia Media</h3>
          <div style={{ fontSize: '3rem', fontWeight: 600 }}>1.2s</div>
        </div>

        <div style={{ gridColumn: 'span 12', background: 'var(--surface-light)', padding: '3rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)', textAlign: 'center', color: 'var(--text-muted)' }}>
           <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
           <h3 style={{ color: 'var(--foreground)', marginBottom: '1rem' }}>Trazas de LangSmith</h3>
           <p style={{ maxWidth: '500px', margin: '0 auto', lineHeight: 1.6 }}>La vista en detalle de las trazas de razonamiento del agente ReAct (Tool calls, LLM chain) estará conectada en breve con la API de LangSmith.</p>
        </div>
      </div>
    </div>
  );
}
