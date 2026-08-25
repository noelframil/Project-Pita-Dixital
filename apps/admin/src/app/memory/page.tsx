"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../clients/page.module.css';

type KnowledgeDocument = {
  source_ref: string;
  chunks: number;
  last_embedded: string;
};

export default function MemoryPage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/admin/knowledge')
      .then(res => res.json())
      .then(data => {
        setDocuments(data.documents || []);
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
          <h1 className={styles.title}>Memoria Semántica (RAG)</h1>
        </div>
        <button className={styles.createBtn} style={{ padding: '0.8rem 1.5rem', background: 'var(--foreground)', color: 'var(--background)', borderRadius: 'var(--radius-lg)', fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.2rem' }}>+</span> Subir Documento
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ gridColumn: 'span 4', background: 'var(--surface-dark)', color: 'var(--text-on-dark)', padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '1rem', color: 'var(--text-muted-on-dark)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Fragmentos Vectorizados</h3>
          <div style={{ fontSize: '3rem', fontWeight: 600 }}>
            {loading ? '...' : documents.reduce((acc, doc) => acc + Number(doc.chunks), 0)}
          </div>
        </div>
        <div style={{ gridColumn: 'span 8', background: 'var(--surface-light)', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.5)' }}>
          <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            <strong>Motor Híbrido Activo.</strong> El bot está combinando búsqueda vectorial (PGVector) con Full-Text Search y RRF (Reciprocal Rank Fusion) para encontrar las respuestas exactas en los manuales de tu negocio antes de contestar a los usuarios.
          </p>
        </div>
      </div>

      <div className={styles.tableContainer} style={{ background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Cargando documentos de memoria...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {documents.map(doc => (
              <div key={doc.source_ref} className={styles.tableRow} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem', background: 'var(--surface-light)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.5)', transition: 'all 0.3s ease', cursor: 'pointer', boxShadow: '0 5px 15px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '48px', height: '48px', background: 'rgba(0,0,0,0.03)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                    {doc.source_ref.endsWith('.pdf') ? '📄' : doc.source_ref.endsWith('.csv') ? '📊' : '📝'}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.2rem' }}>{doc.source_ref}</h3>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Actualizado el {new Date(doc.last_embedded).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--foreground)' }}>{doc.chunks}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Chunks</div>
                  </div>
                  <span style={{ color: 'var(--primary)', fontWeight: 500, padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--radius-md)' }}>Ver contenido &rarr;</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
