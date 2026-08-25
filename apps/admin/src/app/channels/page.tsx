"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  Plus, 
  MessageSquare, 
  Phone, 
  Mail, 
  Send,
  X,
  Lock
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import styles from '../clients/page.module.css';

type Channel = {
  id: string;
  client_id: string;
  channel: string;
  external_id: string;
  is_active: boolean;
};

type ChannelDef = {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  placeholder: string;
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

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedChannel, setSelectedChannel] = useState<ChannelDef | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchChannels = () => {
    fetch('/api/v1/admin/channels')
      .then(res => res.json())
      .then(data => {
        setChannels(data.channels || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchChannels();
  }, []);

  const openConfig = (def: ChannelDef) => {
    setSelectedChannel(def);
    setTokenInput('');
    setIsModalOpen(true);
  };

  const handleSaveToken = async () => {
    if (!selectedChannel || !tokenInput) return;
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: 'mock-client-id', // TODO: Get actual client ID
          channel: selectedChannel.id,
          externalId: selectedChannel.id === 'telegram' ? 'bot' : 'whatsapp-business',
          credentials: { token: tokenInput }
        })
      });
      if (res.ok) {
        // Optimistic UI Update
        setChannels(prev => {
          const exists = prev.find(c => c.channel === selectedChannel.id);
          if (exists) {
            return prev.map(c => c.channel === selectedChannel.id ? { ...c, is_active: true } : c);
          }
          return [...prev, { id: 'new', client_id: 'mock', channel: selectedChannel.id, external_id: 'test', is_active: true }];
        });
        setIsModalOpen(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const channelDefinitions: ChannelDef[] = [
    {
      id: 'telegram',
      name: 'Telegram Bot',
      icon: <Send size={24} color="#2AABEE" />,
      description: 'El mando a distancia principal. Permite enviar notificaciones y comandos al bot al instante.',
      color: '#2AABEE',
      placeholder: 'Token de BotFather (ej. 123456:ABC-DEF...)'
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Oficial',
      icon: <MessageSquare size={24} color="#25D366" />,
      description: 'La vía de entrada más usada. Requiere API Oficial de Meta y cuenta de empresa verificada.',
      color: '#25D366',
      placeholder: 'Access Token de Meta'
    },
    {
      id: 'email',
      name: 'Email (Resend)',
      icon: <Mail size={24} color="#fff" />,
      description: 'Para enviar correos en frío, campañas y captar inversores. Protegido con webhooks.',
      color: '#ffffff',
      placeholder: 'API Key de Resend'
    },
    {
      id: 'twilio',
      name: 'Llamadas Telefónicas',
      icon: <Phone size={24} color="#F22F46" />,
      description: 'Permite al bot atender y realizar llamadas usando Twilio Voice. Responde de forma síncrona.',
      color: '#F22F46',
      placeholder: 'Twilio Auth Token'
    }
  ];

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
              Canales de Comunicación
            </motion.h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Configura por dónde escucha y habla Pita Dixital.</p>
          </div>
          <Button variant="primary" icon={<Plus size={18} />}>
            Añadir Canal Personalizado
          </Button>
        </div>
      </header>

      <div style={{ padding: '0' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Cargando canales...</div>
        ) : (
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}
          >
            {channelDefinitions.map(def => {
              const activeChannel = channels.find(c => c.channel === def.id);
              return (
                <motion.div key={def.id} variants={itemVariants}>
                  <Card hoverEffect style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '2rem', cursor: 'pointer', position: 'relative', overflow: 'hidden' }} onClick={() => openConfig(def)}>
                    {/* Resplandor superior de color */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: def.color, opacity: 0.8 }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '1.5rem', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                          {def.icon}
                        </div>
                        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0 }}>{def.name}</h3>
                      </div>
                      <span style={{ 
                        padding: '4px 10px', 
                        borderRadius: '12px', 
                        fontSize: '0.75rem', 
                        fontWeight: 600,
                        background: activeChannel?.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(161, 161, 170, 0.1)',
                        color: activeChannel?.is_active ? 'var(--success)' : 'var(--text-muted)',
                        border: `1px solid ${activeChannel?.is_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(161, 161, 170, 0.2)'}`
                      }}>
                        {activeChannel?.is_active ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </div>
                    
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6, flex: 1, margin: 0 }}>
                      {def.description}
                    </p>

                    <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', fontSize: '0.85rem' }}>
                      <span style={{ color: def.color, fontWeight: 500 }}>{activeChannel?.is_active ? 'Actualizar Credenciales' : 'Conectar Canal'} &rarr;</span>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {isModalOpen && selectedChannel && (
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
                      {selectedChannel.icon}
                    </div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>Conectar {selectedChannel.name}</h2>
                  </div>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.5, marginTop: '1rem', marginBottom: '1.5rem' }}>
                  {selectedChannel.description}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Token de Acceso</label>
                    <div style={{ position: 'relative' }}>
                      <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                      <input 
                        type="password" 
                        placeholder={selectedChannel.placeholder} 
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
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
                        onFocus={(e) => { e.target.style.borderColor = selectedChannel.color; e.target.style.boxShadow = `0 0 0 2px ${selectedChannel.color}33`; }}
                        onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = 'none'; }}
                      />
                    </div>
                  </div>
                </div>

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
                    onClick={handleSaveToken}
                    disabled={saving || !tokenInput}
                    style={{
                      background: selectedChannel.color,
                      border: 'none',
                      color: selectedChannel.id === 'email' ? '#000' : '#fff',
                      padding: '0.75rem 1.5rem',
                      borderRadius: 'var(--radius-sm)',
                      cursor: (saving || !tokenInput) ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      boxShadow: `0 4px 14px ${selectedChannel.color}66`,
                      opacity: (saving || !tokenInput) ? 0.7 : 1
                    }}
                  >
                    {saving ? 'Conectando...' : 'Guardar y Activar'}
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
