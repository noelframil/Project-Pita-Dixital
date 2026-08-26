"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Bot, Zap, Plus, Settings2, Trash2, ShieldAlert } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import CreateSubAgentModal from './CreateSubAgentModal';

type SubAgent = {
  id: string;
  name: string;
  model: string;
  system_prompt: string;
  max_iterations: number;
  allowed_tools: string[];
};

export default function SubAgentsPage() {
  const [agents, setAgents] = useState<SubAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadAgents = () => {
    setLoading(true);
    fetch('/api/v1/admin/subagents')
      .then(res => res.json())
      .then(data => {
        const mappedAgents = data.subagents?.map((sa: any) => ({
          id: sa.id,
          name: sa.name,
          model: sa.model,
          system_prompt: sa.system_prompt,
          max_iterations: sa.max_iterations,
          allowed_tools: sa.tool_names || []
        })) || [];
        setAgents(mappedAgents);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Seguro que quieres eliminar este subagente?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/admin/subagents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAgents(prev => prev.filter(a => a.id !== id));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Link href="/llmops"
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
            <ArrowLeft size={16} /> Volver a LLMOps
          </Link>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ fontSize: '2.5rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--foreground)' }}
          >
            Enjambre de Subagentes
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', margin: 0 }}>
            Gestiona los especialistas a los que el Orquestador puede delegar tareas de manera autónoma.
          </p>
        </div>
        <motion.button 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsModalOpen(true)}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '0.5rem', 
            padding: '0.8rem 1.5rem', background: 'var(--primary)', color: 'white', 
            border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600
          }}
        >
          <Plus size={18} /> Nuevo Especialista
        </motion.button>
      </header>
      
      <CreateSubAgentModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => loadAgents()}
      />

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Despertando a los subagentes...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
          <AnimatePresence>
            {agents.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem', background: 'var(--surface-dark)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--glass-border)' }}
              >
                <Bot size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0', color: 'var(--foreground)' }}>El enjambre está vacío</h3>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>El bot orquestador está trabajando solo. Añade especialistas para repartir la carga cognitiva.</p>
              </motion.div>
            ) : (
              agents.map((agent, i) => (
                <motion.div 
                  key={agent.id} 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.05 }}
                  style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
                >
                  <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ 
                          width: '48px', height: '48px', borderRadius: '12px', 
                          background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.2rem'
                        }}>
                          {agent.name.charAt(0)}
                        </div>
                        <div>
                          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '0 0 0.2rem 0', color: 'var(--foreground)' }}>{agent.name}</h3>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Zap size={12} color="var(--accent)" /> {agent.model}
                          </span>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDelete(agent.id)}
                        disabled={deletingId === agent.id}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.3rem', transition: 'color 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    
                    <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }}>
                      <span style={{ display: 'block', color: 'var(--foreground)', fontWeight: 500, marginBottom: '0.5rem', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Prompt del Sistema</span>
                      {agent.system_prompt.length > 120 ? agent.system_prompt.substring(0, 120) + '...' : agent.system_prompt}
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <Settings2 size={16} />
                        {agent.allowed_tools.length} Herramientas
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--success)' }}>
                        <ShieldAlert size={16} /> {agent.max_iterations} Iters máx.
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
