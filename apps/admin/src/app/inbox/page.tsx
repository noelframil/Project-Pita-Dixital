"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, MessageSquare, AlertCircle, Clock, User, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';

type Handoff = {
  id: string;
  channel: string;
  status: string;
  channel_user_id: string;
  summarized_until: string | null;
  last_activity: string;
};

export default function InboxPage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHandoffs = () => {
    setLoading(true);
    fetch('/api/v1/admin/handoffs')
      .then(res => res.json())
      .then(data => {
        setHandoffs(data.handoffs || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadHandoffs();
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ marginBottom: '3rem', display: 'flex', alignItems: 'flex-start', gap: '1.5rem' }}>
        <div style={{ 
          width: '64px', height: '64px', borderRadius: '16px', 
          background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)',
          display: 'flex', alignItems: 'center', justify-content: 'center', color: 'var(--info)'
        }}>
          <Inbox size={32} />
        </div>
        <div>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ fontSize: '2.5rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--foreground)' }}
          >
            Bandeja de Entrada
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', margin: 0 }}>
            Conversaciones escaladas por el bot que requieren atención humana inmediata.
          </p>
        </div>
      </header>
      
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Cargando conversaciones...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <AnimatePresence>
            {handoffs.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ textAlign: 'center', padding: '6rem 2rem', background: 'var(--surface-dark)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--glass-border)' }}
              >
                <CheckCircle2 size={48} color="var(--success)" style={{ marginBottom: '1rem', opacity: 0.8 }} />
                <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0', color: 'var(--foreground)' }}>Todo al día</h3>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>El bot está gestionando todas las conversaciones sin problemas. No hay escalados pendientes.</p>
              </motion.div>
            ) : (
              handoffs.map((handoff, i) => (
                <motion.div 
                  key={handoff.id} 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', cursor: 'pointer' }}>
                    <div style={{ 
                      width: '48px', height: '48px', borderRadius: '50%', 
                      background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                      display: 'flex', alignItems: 'center', justify-content: 'center', color: 'var(--danger)'
                    }}>
                      <AlertCircle size={24} />
                    </div>
                    
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.25rem' }}>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <User size={16} color="var(--text-muted)" />
                          {handoff.channel_user_id}
                        </h3>
                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem', background: 'rgba(255,255,255,0.1)', borderRadius: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {handoff.channel}
                        </span>
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <MessageSquare size={14} /> 
                        Conversación escalada por el orquestador.
                      </p>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                        <Clock size={14} />
                        Hace unos instantes
                      </div>
                      <button 
                        style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 500 }}
                      >
                        Responder
                      </button>
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
