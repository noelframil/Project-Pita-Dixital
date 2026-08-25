import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Building2, ChevronRight, Check, FileText, Database, Webhook, Loader2 } from 'lucide-react';

type WizardProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

type Blueprint = {
  assistantName: string;
  preview: string;
  variables: Record<string, string>;
  usage: any;
};

export default function WizardOnboarding({ isOpen, onClose, onSuccess }: WizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [clientName, setClientName] = useState('');
  const [brief, setBrief] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!clientName.trim() || !brief.trim()) return;
    
    setStep(2);
    setIsGenerating(true);
    setError(null);

    try {
      const slug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const res = await fetch(`/api/v1/admin/clients/${slug}/autoconfig`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief }),
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Ocurrió un error en el Autoconfig');
      }

      // Simulate some extra generation time for the premium feel
      setTimeout(() => {
        setBlueprint(data.blueprint);
        setIsGenerating(false);
        setStep(3);
      }, 2000);

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setIsGenerating(false);
      setStep(1);
    }
  };

  const handleConfirm = () => {
    // Here we would normally save the blueprint definitively to DB
    onSuccess();
  };

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ 
          position: 'fixed', inset: 0, zIndex: 100, 
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          background: 'rgba(5,5,10,0.8)', backdropFilter: 'blur(12px)' 
        }}
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          style={{ 
            background: 'var(--surface-dark)', 
            border: '1px solid var(--glass-border)', 
            borderRadius: 'var(--radius-xl)',
            width: '100%', maxWidth: '800px', 
            minHeight: '500px',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(139, 92, 246, 0.25)',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          {/* Glowing orb effect in background */}
          <div style={{
            position: 'absolute', top: '-20%', left: '-10%', width: '60%', height: '60%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(0,0,0,0) 70%)',
            zIndex: 0, pointerEvents: 'none'
          }} />

          <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))', padding: '0.5rem', borderRadius: 'var(--radius-md)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={20} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--foreground)' }}>Autoconfig Wizard</h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Crea un agente experto en segundos</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '50%', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ flex: 1, position: 'relative', zIndex: 10 }}>
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div 
                  key="step1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  style={{ padding: '3rem 4rem', display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center' }}
                >
                  <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', fontWeight: 600 }}>Háblanos del cliente</h3>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>La Inteligencia Artificial diseñará la arquitectura, los prompts y las herramientas necesarias basándose en tu descripción.</p>
                  
                  {error && (
                    <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--danger)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
                      {error}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--foreground)', fontWeight: 500 }}>
                        <Building2 size={16} color="var(--primary)"/> Nombre de la Empresa / Proyecto
                      </label>
                      <input 
                        value={clientName} 
                        onChange={e => setClientName(e.target.value)} 
                        placeholder="Ej. Hotel Luz del Sol"
                        style={{ width: '100%', padding: '1rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--foreground)', outline: 'none', fontSize: '1rem' }}
                      />
                    </div>
                    
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--foreground)', fontWeight: 500 }}>
                        <FileText size={16} color="var(--primary)"/> Brief / Requisitos (Lenguaje Natural)
                      </label>
                      <textarea 
                        value={brief} 
                        onChange={e => setBrief(e.target.value)} 
                        rows={4} 
                        placeholder="Ej. Somos un hotel rural de 5 habitaciones. Necesitamos un bot de WhatsApp que responda FAQs sobre horarios y mascotas, y que permita comprobar disponibilidad conectándose a nuestro RMS."
                        style={{ width: '100%', padding: '1rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', color: 'var(--foreground)', outline: 'none', fontSize: '1rem', resize: 'none' }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                      onClick={handleGenerate}
                      disabled={!clientName.trim() || !brief.trim()}
                      style={{ 
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '1rem 2.5rem', background: 'linear-gradient(90deg, var(--primary), var(--secondary))', color: 'white', 
                        border: 'none', borderRadius: 'var(--radius-full)', cursor: 'pointer', fontWeight: 600, fontSize: '1rem',
                        opacity: (!clientName.trim() || !brief.trim()) ? 0.5 : 1,
                        boxShadow: '0 10px 25px -5px rgba(139, 92, 246, 0.4)'
                      }}
                    >
                      Generar IA <ChevronRight size={18} />
                    </button>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div 
                  key="step2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                    style={{ width: '100px', height: '100px', marginBottom: '2rem', position: 'relative' }}
                  >
                    <div style={{ position: 'absolute', inset: 0, border: '4px solid rgba(139,92,246,0.1)', borderRadius: '50%' }}></div>
                    <div style={{ position: 'absolute', inset: 0, borderTop: '4px solid var(--primary)', borderRadius: '50%' }}></div>
                  </motion.div>
                  
                  <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 600, textAlign: 'center' }}>Ingeniería de Prompts en curso...</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '300px' }}>
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '0.9rem' }}
                    >
                      <Check size={16} /> Analizando requisitos de negocio
                    </motion.div>
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.2 }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontSize: '0.9rem' }}
                    >
                      <Check size={16} /> Seleccionando herramientas óptimas
                    </motion.div>
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.8 }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}
                    >
                      <Loader2 size={16} className="spin" style={{ animation: 'spin 2s linear infinite' }} /> Redactando System Prompt...
                    </motion.div>
                  </div>
                </motion.div>
              )}

              {step === 3 && blueprint && (
                <motion.div 
                  key="step3"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}
                >
                  <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ display: 'inline-flex', padding: '0.5rem 1rem', background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', borderRadius: '2rem', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem' }}>
                      ¡Blueprint Generado con Éxito!
                    </div>
                    <h3 style={{ fontSize: '1.8rem', margin: 0, fontWeight: 700 }}>{blueprint.assistantName || clientName}</h3>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', flex: 1 }}>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)' }}>
                      <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', margin: '0 0 1rem 0', fontSize: '1rem' }}>
                        <Database size={18} /> System Prompt Base
                      </h4>
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)', height: '180px', overflowY: 'auto' }}>
                        {blueprint.preview}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)' }}>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)', margin: '0 0 1rem 0', fontSize: '1rem' }}>
                          <Webhook size={18} /> Variables Extraídas
                        </h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {Object.entries(blueprint.variables || {}).map(([k, v]) => (
                            <span key={k} style={{ background: 'rgba(255,255,255,0.05)', padding: '0.3rem 0.6rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--foreground)' }}>
                              <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>{k}:</span>{String(v)}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', flex: 1 }}>
                        <h4 style={{ color: 'var(--foreground)', margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Siguientes pasos</h4>
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>Al confirmar, el cliente se creará en la base de datos con esta configuración inicial. Podrás subir documentos a su RAG en el panel principal.</p>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button 
                      onClick={() => setStep(1)}
                      style={{ padding: '0.8rem 1.5rem', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                    >
                      Atrás
                    </button>
                    <button 
                      onClick={handleConfirm}
                      style={{ 
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.8rem 2rem', background: 'var(--success)', color: 'white', 
                        border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600,
                        boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                      }}
                    >
                      <Check size={18} /> Confirmar y Desplegar
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
