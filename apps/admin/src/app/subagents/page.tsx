"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Brain, Database, Bot, Zap, Search } from 'lucide-react';
import { Card } from '../../components/ui/Card';

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
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Link href="/"
            style={{
              color: 'var(--text-muted)',
              marginBottom: '1rem',
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
            style={{ fontSize: '2.5rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--foreground)' }}
          >
            Enjambre de Subagentes
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', margin: 0 }}>
            Configura agentes especializados para delegar tareas complejas del orquestador.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/subagents/canvas"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem', 
              padding: '0.8rem 1.5rem', background: 'rgba(139, 92, 246, 0.1)', color: 'var(--primary)', 
              border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600,
              textDecoration: 'none'
            }}
          >
            <Brain size={18} /> Visualizar Topología
          </Link>
          <motion.button 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem', 
              padding: '0.8rem 1.5rem', background: 'var(--primary)', color: 'white', 
              border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600
            }}
          >
            <Plus size={18} /> Nuevo Subagente
          </motion.button>
        </div>
      </header>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: '2rem' }}
      >
        <Card style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(59, 130, 246, 0.1))', padding: '2.5rem', display: 'flex', alignItems: 'center', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
          <div style={{ 
            width: '64px', height: '64px', borderRadius: '16px', 
            background: 'rgba(139, 92, 246, 0.2)', color: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginRight: '1.5rem', flexShrink: 0
          }}>
            <Brain size={32} />
          </div>
          <div>
             <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--foreground)' }}>Arquitectura Multi-Agente (Orquestador ↔ Especialista)</h3>
             <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
               El Agente principal (Orquestador) puede delegar tareas complejas en estos Subagentes Expertos. Cada subagente funciona de forma aislada con su propio modelo, temperatura y herramientas (Function Calling), devolviendo el resultado limpio al Orquestador para no consumir todo el contexto.
             </p>
          </div>
        </Card>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {loading ? (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Cargando arquitecturas...</div>
        ) : (
          subagents.map((sa, i) => (
            <motion.div 
              key={sa.id} 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%', cursor: 'pointer', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ 
                      width: '48px', height: '48px', borderRadius: '12px', 
                      background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(16, 185, 129, 0.2))', 
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--secondary)'
                    }}>
                      {sa.name.includes('reservas') ? <Database size={20} /> : sa.name.includes('facturacion') ? <Zap size={20} /> : <Bot size={20} />}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '0 0 0.2rem 0', color: 'var(--foreground)' }}>{sa.name}</h3>
                    </div>
                  </div>
                  <span style={{ 
                    padding: '4px 10px', 
                    borderRadius: '12px', 
                    fontSize: '0.75rem', 
                    fontWeight: 600,
                    background: sa.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(161, 161, 170, 0.1)',
                    color: sa.is_active ? 'var(--success)' : 'var(--text-muted)',
                    border: `1px solid ${sa.is_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(161, 161, 170, 0.2)'}`
                  }}>
                    {sa.is_active ? 'ACTIVO' : 'INACTIVO'}
                  </span>
                </div>
                
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, flex: 1 }}>
                  {sa.description}
                </p>

                <div style={{ marginTop: '1.5rem', width: '100%', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <span style={{ padding: '0.2rem 0.6rem', background: 'rgba(255,255,255,0.05)', color: 'var(--foreground)', borderRadius: 'var(--radius-sm)' }}>{sa.model}</span>
                    <span style={{ padding: '0.2rem 0.6rem', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)' }}>Temp: {sa.temperature}</span>
                  </div>
                  <span style={{ color: 'var(--primary)', fontWeight: 500 }}>Ajustar &rarr;</span>
                </div>
              </Card>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
