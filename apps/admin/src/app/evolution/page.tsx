"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Cpu, Code2, Play, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import styles from '../clients/page.module.css';

type SynthesizedTool = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  script_code: string;
  input_schema: any;
};

export default function EvolutionPage() {
  const [tools, setTools] = useState<SynthesizedTool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<SynthesizedTool | null>(null);

  useEffect(() => {
    fetch('/api/v1/admin/tools/synthesized')
      .then(res => res.json())
      .then(data => {
        setTools(data.tools || []);
        setIsLoading(false);
      })
      .catch(console.error);
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.header} style={{ marginBottom: '2rem' }}>
        <div>
          <Link href="/"
            style={{
              color: 'var(--text-muted)',
              marginBottom: '0.5rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
              textDecoration: 'none',
              transition: 'color 0.2s'
            }}
          >
            <ArrowLeft size={16} /> Volver al Dashboard
          </Link>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >
            <Cpu size={28} color="var(--success)" /> Self-Evolution & Tool Synthesis
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', margin: 0 }}>
            Audita y gestiona las herramientas (Custom Scripts) que el Agente ha programado para sí mismo de manera autónoma.
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {isLoading ? (
            <p style={{ color: 'var(--text-muted)' }}>Cargando matriz evolutiva...</p>
          ) : tools.length === 0 ? (
            <Card style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Code2 size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
              <p>El bot aún no ha escrito ninguna herramienta para sí mismo.</p>
            </Card>
          ) : (
            tools.map((t, i) => (
              <motion.div 
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => setSelectedTool(t)}
              >
                <Card hoverEffect style={{ 
                  padding: '1.5rem', cursor: 'pointer',
                  border: selectedTool?.id === t.id ? '1px solid var(--success)' : '1px solid var(--glass-border)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Code2 size={18} color="var(--primary)"/> 
                        {t.name}
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t.description}</p>
                    </div>
                    {t.is_active ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--success)' }}><CheckCircle2 size={14}/> Activo</span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: 'var(--warning)' }}><ShieldAlert size={14}/> Pausado</span>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </div>

        <div>
          {selectedTool ? (
            <Card style={{ position: 'sticky', top: '2rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>Inspector de Código</h3>
                <button style={{ background: 'var(--surface-dark)', color: 'var(--foreground)', border: '1px solid var(--border-subtle)', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Play size={14} /> Test Run
                </button>
              </div>
              <div>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Input Schema (JSON)</h4>
                <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--primary)', overflowX: 'auto' }}>
                  {JSON.stringify(selectedTool.input_schema, null, 2)}
                </pre>
              </div>
              <div>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Source Code (Node.js)</h4>
                <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--success)', overflowX: 'auto', fontFamily: 'monospace' }}>
                  {selectedTool.script_code}
                </pre>
              </div>
            </Card>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-subtle)', borderRadius: '12px' }}>
              Selecciona una herramienta para inspeccionar su código fuente.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
