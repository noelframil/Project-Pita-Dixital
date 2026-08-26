"use client";

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, MessageSquare, AlertCircle, Clock, User, CheckCircle2, Send, Phone, MoreVertical, X, Bot } from 'lucide-react';
import { Card } from '../../components/ui/Card';

type Handoff = {
  id: string;
  channel: string;
  status: string;
  channel_user_id: string;
  summarized_until: string | null;
  last_activity: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant' | 'human';
  content: string;
  timestamp: string;
};

export default function InboxPage() {
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHandoff, setSelectedHandoff] = useState<Handoff | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const selectHandoff = (h: Handoff) => {
    setSelectedHandoff(h);
    // Mocking conversation context for demo purposes
    setMessages([
      { id: '1', role: 'user', content: 'Hola, tengo un problema con mi factura. Me han cobrado dos veces.', timestamp: new Date(Date.now() - 3600000).toISOString() },
      { id: '2', role: 'assistant', content: 'Lamento escuchar eso. He revisado el sistema y veo un cargo duplicado. ¿Deseas que inicie un reembolso o prefieres hablar con un agente humano?', timestamp: new Date(Date.now() - 3500000).toISOString() },
      { id: '3', role: 'user', content: 'Prefiero hablar con una persona, por favor.', timestamp: new Date(Date.now() - 3400000).toISOString() },
      { id: '4', role: 'assistant', content: 'Entendido. Estoy transfiriendo tu caso a nuestro equipo de soporte humano. Te responderán por este mismo canal en breve.', timestamp: new Date(Date.now() - 3350000).toISOString() }
    ]);
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    
    const newMsg: Message = {
      id: Date.now().toString(),
      role: 'human',
      content: replyText,
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, newMsg]);
    setReplyText('');
    
    // In real app, we would POST to /api/v1/admin/handoffs/:id/reply
  };

  return (
    <div style={{ height: 'calc(100vh - 5rem)', display: 'flex', flexDirection: 'column' }}>
      <header style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexShrink: 0 }}>
        <div style={{ 
          width: '48px', height: '48px', borderRadius: '12px', 
          background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--secondary)'
        }}>
          <Inbox size={24} />
        </div>
        <div>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ fontSize: '1.8rem', fontWeight: 700, margin: '0 0 0.2rem 0', color: 'var(--foreground)' }}
          >
            Bandeja de Intervención (Inbox)
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Asume el control de las conversaciones escaladas por el agente.
          </p>
        </div>
      </header>
      
      <div style={{ flex: 1, display: 'flex', gap: '1.5rem', overflow: 'hidden' }}>
        {/* Left Pane: Conversation List */}
        <Card style={{ width: '380px', display: 'flex', flexDirection: 'column', padding: '1rem', background: 'var(--surface-card)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, padding: '0.5rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
            Casos Pendientes ({handoffs.length})
          </h3>
          
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' }}>
            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>
            ) : handoffs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                <CheckCircle2 size={32} color="var(--success)" style={{ margin: '0 auto 1rem', opacity: 0.8 }} />
                <p>Todo al día</p>
              </div>
            ) : (
              handoffs.map((handoff) => (
                <motion.div key={handoff.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <div 
                    onClick={() => selectHandoff(handoff)}
                    style={{ 
                      padding: '1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      background: selectedHandoff?.id === handoff.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${selectedHandoff?.id === handoff.id ? 'var(--secondary)' : 'var(--border-subtle)'}`,
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                        <User size={14} color="var(--text-muted)" />
                        {handoff.channel_user_id}
                      </div>
                      <div className="status-pulse" style={{ width: '6px', height: '6px' }}>
                        <span style={{ background: 'var(--danger)', boxShadow: '0 0 8px var(--danger)' }}></span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span style={{ padding: '0.1rem 0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '1rem', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                        {handoff.channel}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={12} /> Hace 5 min
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </Card>

        {/* Right Pane: Active Chat */}
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', background: 'var(--surface-card)' }}>
          {selectedHandoff ? (
            <>
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                    {selectedHandoff.channel_user_id.slice(0,2)}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{selectedHandoff.channel_user_id}</h3>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Vía {selectedHandoff.channel}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'var(--foreground)' }}><Phone size={18} /></button>
                  <button style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', color: 'var(--foreground)' }}><MoreVertical size={18} /></button>
                  <button onClick={() => setSelectedHandoff(null)} style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}><X size={18} /></button>
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ textAlign: 'center', margin: '1rem 0' }}>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '0.2rem 0.8rem', borderRadius: '1rem', color: 'var(--text-muted)' }}>Historial de Bot</span>
                </div>
                
                <AnimatePresence>
                  {messages.map((msg, i) => {
                    const isAgent = msg.role === 'assistant' || msg.role === 'human';
                    const isHuman = msg.role === 'human';
                    return (
                      <motion.div 
                        key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ 
                          alignSelf: isAgent ? 'flex-start' : 'flex-end', 
                          maxWidth: '75%',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.3rem'
                        }}
                      >
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: isAgent ? 'flex-start' : 'flex-end', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          {isHuman && <User size={12} color="var(--primary)"/>}
                          {msg.role === 'assistant' && <Bot size={12} color="var(--secondary)"/>}
                          {isHuman ? 'Tú (Agente Humano)' : msg.role === 'assistant' ? 'Bot' : 'Cliente'}
                        </div>
                        <div style={{ 
                          padding: '1rem 1.25rem', 
                          borderRadius: '1rem',
                          background: isHuman ? 'linear-gradient(135deg, var(--primary), var(--secondary))' : 
                                     isAgent ? 'rgba(59, 130, 246, 0.1)' : 'var(--surface-light)',
                          color: isHuman ? '#fff' : 'var(--foreground)',
                          border: isHuman ? 'none' : `1px solid ${isAgent ? 'rgba(59, 130, 246, 0.2)' : 'var(--border-subtle)'}`,
                          borderTopLeftRadius: isAgent ? '4px' : '1rem',
                          borderTopRightRadius: !isAgent ? '4px' : '1rem',
                          boxShadow: isHuman ? '0 4px 15px rgba(139, 92, 246, 0.3)' : 'none'
                        }}>
                          {msg.content}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                <div ref={messagesEndRef} />
              </div>

              <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--border-subtle)' }}>
                <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    placeholder={`Escribiendo como soporte humano a ${selectedHandoff.channel_user_id}...`}
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    style={{ 
                      flex: 1, padding: '0.8rem 1rem', 
                      background: 'rgba(255,255,255,0.05)', color: 'var(--foreground)', 
                      border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)',
                      outline: 'none'
                    }}
                  />
                  <button 
                    type="submit"
                    disabled={!replyText.trim()}
                    style={{ 
                      padding: '0 1.25rem', height: '45px',
                      background: 'var(--primary)', color: '#fff', 
                      border: 'none', borderRadius: 'var(--radius-lg)',
                      cursor: !replyText.trim() ? 'not-allowed' : 'pointer',
                      opacity: !replyText.trim() ? 0.5 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <MessageSquare size={64} style={{ opacity: 0.1, marginBottom: '1rem' }} />
              <p style={{ fontSize: '1.1rem' }}>Selecciona una conversación de la lista para intervenir.</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
