"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../clients/page.module.css';

type SubAgent = {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  model: string;
  temperature: number;
  is_active: boolean;
};

export default function SubAgentsPage() {
  const [subagents, setSubagents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/admin/subagents')
      .then(res => res.json())
      .then(data => {
        setSubagents(data.subagents || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

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
          <h1 className={styles.title}>Subagentes Especialistas</h1>
        </div>
        <button className={styles.createBtn} style={{ padding: '0.8rem 1.5rem', background: 'var(--foreground)', color: 'var(--background)', borderRadius: 'var(--radius-lg)', fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.2rem' }}>+</span> Nuevo Subagente
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ gridColumn: 'span 12', background: 'var(--surface-light)', padding: '2.5rem', borderRadius: 'var(--radius-lg)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.5)' }}>
          <div style={{ fontSize: '3rem', marginRight: '1.5rem' }}>🧠</div>
          <div>
             <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Arquitectura Multi-Agente (Orquestador ↔ Especialista)</h3>
             <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
               El Agente principal (Orquestador) puede delegar tareas complejas en estos Subagentes Expertos. Cada subagente funciona de forma aislada con su propio modelo, temperatura y herramientas (Function Calling), devolviendo el resultado limpio al Orquestador para no consumir todo el contexto.
             </p>
          </div>
        </div>
      </div>

      <div className={styles.tableContainer} style={{ background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Cargando arquitecturas...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
            {subagents.map(sa => (
              <div key={sa.id} className={styles.tableRow} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '2rem', background: 'var(--surface-light)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.5)', transition: 'all 0.3s ease', cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '1rem', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '40px', height: '40px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                      {sa.name.includes('reservas') ? '📅' : sa.name.includes('facturacion') ? '💸' : '🛠️'}
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{sa.name}</h3>
                  </div>
                  <span className={`${styles.statusBadge} ${sa.is_active ? styles.active : styles.inactive}`}>
                    {sa.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, flex: 1 }}>
                  {sa.description}
                </p>

                <div style={{ marginTop: '1.5rem', width: '100%', paddingTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', gap: '0.8rem' }}>
                    <span style={{ padding: '0.2rem 0.5rem', background: 'var(--surface-dark)', color: 'var(--text-on-dark)', borderRadius: '4px' }}>{sa.model}</span>
                    <span style={{ padding: '0.2rem 0.5rem', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}>T: {sa.temperature}</span>
                  </div>
                  <span style={{ color: 'var(--primary)', fontWeight: 500 }}>Ajustar &rarr;</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
