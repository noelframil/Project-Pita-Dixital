import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bot, Wrench, Check, Loader2 } from 'lucide-react';

type CreateSubAgentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type Tool = {
  id: string;
  name: string;
  description: string;
};

export default function CreateSubAgentModal({ isOpen, onClose, onSuccess }: CreateSubAgentModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [tools, setTools] = useState<string[]>([]);
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch('/api/v1/admin/tools')
        .then(res => res.json())
        .then(data => setAvailableTools(data.tools || []))
        .catch(console.error);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/subagents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: 'mock-client-id',
          name,
          description,
          systemPrompt,
          model,
          toolNames: tools,
        }),
      });
      if (res.ok) {
        setName('');
        setDescription('');
        setSystemPrompt('');
        setTools([]);
        onSuccess();
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTool = (tool: string) => {
    setTools(prev => 
      prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]
    );
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ 
          position: 'fixed', inset: 0, zIndex: 50, 
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' 
        }}
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          style={{ 
            background: 'var(--surface-dark)', 
            border: '1px solid var(--glass-border)', 
            borderRadius: 'var(--radius-lg)',
            width: '100%', maxWidth: '600px', 
            maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}
        >
          <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--surface-dark)', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(139, 92, 246, 0.1)', padding: '0.5rem', borderRadius: 'var(--radius-md)', color: 'var(--primary)' }}>
                <Bot size={24} />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--foreground)' }}>Crear Especialista</h2>
            </div>
            <button 
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.5rem' }}
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--foreground)', fontWeight: 500 }}>Nombre del Agente</label>
                <input 
                  required 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="Ej. Agente Legal"
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--foreground)', outline: 'none' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--foreground)', fontWeight: 500 }}>Descripción corta</label>
                <input 
                  required 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  placeholder="Para qué sirve este especialista"
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--foreground)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--foreground)', fontWeight: 500 }}>System Prompt (Instrucciones)</label>
                <textarea 
                  required 
                  value={systemPrompt} 
                  onChange={e => setSystemPrompt(e.target.value)} 
                  rows={4} 
                  placeholder="Eres un experto en..."
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--foreground)', outline: 'none', resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--foreground)', fontWeight: 500 }}>Modelo de IA</label>
                <select 
                  value={model} 
                  onChange={e => setModel(e.target.value)}
                  style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--foreground)', outline: 'none', appearance: 'none' }}
                >
                  <option value="gpt-4o-mini" style={{ background: 'var(--surface-dark)' }}>GPT-4o Mini (Rápido y barato)</option>
                  <option value="gpt-4o" style={{ background: 'var(--surface-dark)' }}>GPT-4o (Máxima inteligencia)</option>
                  <option value="claude-3-5-sonnet" style={{ background: 'var(--surface-dark)' }}>Claude 3.5 Sonnet</option>
                  <option value="qwen2.5:32b" style={{ background: 'var(--surface-dark)' }}>Qwen 2.5 32B (Local)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--foreground)', fontWeight: 500 }}>
                  <Wrench size={16} color="var(--primary)"/> Herramientas Permitidas
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  {availableTools.map(t => {
                    const isSelected = tools.includes(t.name);
                    return (
                      <div 
                        key={t.name} 
                        onClick={() => toggleTool(t.name)}
                        style={{ 
                          display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
                          background: isSelected ? 'rgba(139, 92, 246, 0.1)' : 'rgba(0,0,0,0.2)',
                          border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--glass-border)'}`,
                          borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ 
                          width: '20px', height: '20px', borderRadius: '4px', 
                          background: isSelected ? 'var(--primary)' : 'transparent', 
                          border: `1px solid ${isSelected ? 'var(--primary)' : 'rgba(255,255,255,0.2)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          {isSelected && <Check size={14} color="white" />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.85rem', color: 'var(--foreground)', fontWeight: 500 }}>{t.name}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)' }}>
              <button 
                type="button" 
                onClick={onClose}
                style={{ padding: '0.75rem 1.5rem', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontWeight: 500 }}
              >
                Cancelar
              </button>
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit" 
                disabled={loading}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.75rem 2rem', background: 'var(--primary)', color: 'white', 
                  border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600,
                  opacity: loading ? 0.7 : 1
                }}
              >
                {loading ? <Loader2 size={18} className="spin" style={{ animation: 'spin 2s linear infinite' }} /> : 'Crear Agente'}
              </motion.button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
