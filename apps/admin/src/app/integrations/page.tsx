"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../clients/page.module.css';

type Tool = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  kind: string;
};

export default function IntegrationsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/admin/tools')
      .then(res => res.json())
      .then(data => {
        setTools(data.tools || []);
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
          <h1 className={styles.title}>Integraciones & Tools</h1>
        </div>
        <button className={styles.createBtn} style={{ padding: '0.8rem 1.5rem', background: 'var(--foreground)', color: 'var(--background)', borderRadius: 'var(--radius-lg)', fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.2rem' }}>+</span> Añadir Webhook
        </button>
      </header>

      <div className={styles.tableContainer} style={{ background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Cargando competencias...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
            {tools.map(tool => (
              <div key={tool.id} className={styles.tableRow} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '2rem', background: 'var(--surface-light)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.5)', transition: 'all 0.3s ease', cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '1rem', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '40px', height: '40px', background: 'rgba(0,0,0,0.03)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                      {tool.name.includes('stripe') || tool.name.includes('pago') ? '💳' : tool.name.includes('calendario') || tool.name.includes('disponibilidad') ? '📅' : '🔌'}
                    </div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{tool.name}</h3>
                  </div>
                  <span className={`${styles.statusBadge} ${tool.is_active ? styles.active : styles.inactive}`}>
                    {tool.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, flex: 1 }}>
                  {tool.description}
                </p>

                <div style={{ marginTop: '1.5rem', width: '100%', paddingTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>Tipo: {tool.kind.toUpperCase()}</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 500 }}>Configurar &rarr;</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
