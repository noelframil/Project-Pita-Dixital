"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  Plus, 
  CreditCard, 
  Calendar, 
  Search, 
  Code, 
  Globe,
  Zap,
  Clock,
  X,
  Lock
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import styles from '../clients/page.module.css';

type Tool = {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  kind: string;
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } },
  exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } }
};

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.3 } }
};

const getToolIcon = (name: string) => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('stripe') || lowerName.includes('pago')) return <CreditCard size={24} color="var(--primary)" />;
  if (lowerName.includes('calendario') || lowerName.includes('disponibilidad')) return <Calendar size={24} color="var(--secondary)" />;
  if (lowerName.includes('search') || lowerName.includes('web')) return <Globe size={24} color="var(--success)" />;
  if (lowerName.includes('code') || lowerName.includes('browser')) return <Code size={24} color="var(--warning)" />;
  if (lowerName.includes('cron') || lowerName.includes('schedule')) return <Clock size={24} color="var(--accent)" />;
  return <Zap size={24} color="var(--text-muted)" />;
};

export default function IntegrationsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

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

  const openConfig = (tool: Tool) => {
    setSelectedTool(tool);
    setConfigValues({});
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedTool) return;
    setSaving(true);
    try {
      const res = await fetch(`http://localhost:3000/api/v1/admin/tools/${selectedTool.id}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: configValues })
      });
      if (res.ok) {
        setTools(tools.map(t => t.id === selectedTool.id ? { ...t, is_active: true } : t));
        setIsModalOpen(false);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const renderInputs = () => {
    if (!selectedTool) return null;
    const isStripe = selectedTool.name.toLowerCase().includes('stripe') || selectedTool.name.toLowerCase().includes('pago');
    
    if (isStripe) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Stripe Secret Key</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="password" 
                placeholder="sk_live_..." 
                value={configValues['STRIPE_SECRET_KEY'] || ''}
                onChange={(e) => setConfigValues({ ...configValues, STRIPE_SECRET_KEY: e.target.value })}
                style={{ 
                  width: '100%', 
                  padding: '12px 12px 12px 40px', 
                  background: 'rgba(0,0,0,0.2)', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--foreground)',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 2px rgba(255, 45, 85, 0.2)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
          </div>
          <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: 'var(--radius-sm)', display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
             <Globe size={18} color="var(--success)" style={{ flexShrink: 0, marginTop: '2px' }} />
             <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
               Las claves se cifran con AES-256-GCM antes de guardarse en base de datos. Ningún agente ni persona puede verlas en texto plano una vez guardadas.
             </p>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>API Token / Clave de Acceso</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="password" 
                placeholder="Introduce el token..." 
                value={configValues['API_TOKEN'] || ''}
                onChange={(e) => setConfigValues({ ...configValues, API_TOKEN: e.target.value })}
                style={{ 
                  width: '100%', 
                  padding: '12px 12px 12px 40px', 
                  background: 'rgba(0,0,0,0.2)', 
                  border: '1px solid rgba(255,255,255,0.1)', 
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--foreground)',
                  outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 2px rgba(255, 45, 85, 0.2)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
          </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
              style={{ fontSize: '2rem', fontWeight: 600, margin: '0 0 0.5rem 0', color: 'var(--foreground)' }}
            >
              Integraciones y Herramientas (Tools)
            </motion.h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Herramientas activadas para este cliente. El agente decide cuándo y cómo utilizarlas en tiempo real.</p>
          </div>
          <a 
            href="http://localhost:3000/api/v1/oauth/google" 
            style={{ 
              background: '#4285F4', 
              color: '#fff', 
              padding: '0.6rem 1.2rem', 
              borderRadius: 'var(--radius-sm)', 
              textDecoration: 'none', 
              fontWeight: 500, 
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 14px rgba(66, 133, 244, 0.4)'
            }}
          >
            <Calendar size={18} />
            Conectar Google Workspace
          </a>
        </div>
        <Button variant="primary" icon={<Plus size={18} />}>
          Añadir Webhook
        </Button>
      </header>

      <div style={{ padding: '0' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Cargando competencias...</div>
        ) : (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}
          >
            {tools.map(tool => (
              <motion.div key={tool.id} variants={itemVariants}>
                <Card hoverEffect style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '2rem', cursor: 'pointer' }} onClick={() => openConfig(tool)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '1.5rem', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {getToolIcon(tool.name)}
                      </div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>{tool.name}</h3>
                    </div>
                    <span style={{ 
                      padding: '4px 10px', 
                      borderRadius: '12px', 
                      fontSize: '0.75rem', 
                      fontWeight: 600,
                      background: tool.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(161, 161, 170, 0.1)',
                      color: tool.is_active ? 'var(--success)' : 'var(--text-muted)',
                      border: `1px solid ${tool.is_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(161, 161, 170, 0.2)'}`
                    }}>
                      {tool.is_active ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </div>
                  
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6, flex: 1, margin: 0 }}>
                    {tool.description}
                  </p>

                  <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Code size={14} /> 
                      {tool.kind.toUpperCase()}
                    </span>
                    <span style={{ color: 'var(--primary)', fontWeight: 500 }}>Configurar &rarr;</span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && selectedTool && (
          <>
            <motion.div
              variants={overlayVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{ 
                position: 'fixed', 
                top: 0, left: 0, right: 0, bottom: 0, 
                background: 'rgba(0,0,0,0.6)', 
                backdropFilter: 'blur(10px)',
                zIndex: 999
              }}
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div
              variants={modalVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1000,
                width: '100%',
                maxWidth: '500px',
              }}
            >
              <div style={{
                background: 'rgba(25, 25, 25, 0.85)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '16px',
                padding: '2rem',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {getToolIcon(selectedTool.name)}
                    </div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>Configurar {selectedTool.name}</h2>
                  </div>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.5, marginTop: '1rem', marginBottom: '1.5rem' }}>
                  {selectedTool.description}
                </p>

                {renderInputs()}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2.5rem' }}>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-muted)',
                      padding: '0.75rem 1.5rem',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontWeight: 500,
                      transition: 'all 0.2s'
                    }}
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      background: 'var(--primary)',
                      border: 'none',
                      color: '#fff',
                      padding: '0.75rem 1.5rem',
                      borderRadius: 'var(--radius-sm)',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      boxShadow: '0 4px 14px rgba(255, 45, 85, 0.4)',
                      opacity: saving ? 0.7 : 1
                    }}
                  >
                    {saving ? 'Guardando...' : 'Guardar y Activar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
