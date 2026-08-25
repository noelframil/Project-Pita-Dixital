"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../clients/page.module.css';

type Channel = {
  id: string;
  client_id: string;
  channel: string;
  external_id: string;
  is_active: boolean;
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState<string | null>(null);
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

  const handleSaveToken = async (channelKey: string) => {
    if (!tokenInput) return;
    setSaving(true);
    try {
      await fetch('/api/v1/admin/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: 'mock-client-id', // TODO: Get actual client ID
          channel: channelKey,
          externalId: channelKey === 'telegram' ? 'bot' : 'whatsapp-business',
          credentials: { token: tokenInput }
        })
      });
      setTokenInput('');
      setShowConfig(null);
      fetchChannels();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const channelDefinitions = [
    {
      id: 'telegram',
      name: 'Telegram Bot',
      icon: '✈️',
      description: 'El mando a distancia principal. Permite enviar notificaciones y comandos al bot al instante.',
      color: '#2AABEE',
      placeholder: 'Pega aquí el Token de BotFather'
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp Oficial',
      icon: '💬',
      description: 'La vía de entrada más usada. Requiere API Oficial de Meta y cuenta de empresa verificada.',
      color: '#25D366',
      placeholder: 'Pega aquí el Access Token de Meta'
    },
    {
      id: 'email',
      name: 'Email (Resend)',
      icon: '📧',
      description: 'Para enviar correos en frío, campañas y captar inversores. Protegido con webhooks.',
      color: '#000000',
      placeholder: 'Pega aquí la API Key de Resend'
    }
  ];

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
          <h1 className={styles.title}>Canales de Comunicación</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Configura por dónde escucha y habla Pita Dixital.
          </p>
        </div>
      </header>

      <div className={styles.tableContainer} style={{ background: 'transparent', boxShadow: 'none', border: 'none', padding: 0 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Cargando canales...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
            {channelDefinitions.map(def => {
              const activeChannel = channels.find(c => c.channel === def.id);
              const isConfiguring = showConfig === def.id;

              return (
                <div key={def.id} className={styles.tableRow} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '2rem',
                  background: 'var(--surface-light)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid rgba(255,255,255,0.5)',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  {/* Resplandor superior de color */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: def.color, opacity: 0.8 }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginBottom: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ width: '40px', height: '40px', background: `${def.color}15`, color: def.color, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                        {def.icon}
                      </div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{def.name}</h3>
                    </div>
                    <span className={`${styles.statusBadge} ${activeChannel?.is_active ? styles.active : styles.inactive}`}>
                      {activeChannel?.is_active ? 'Conectado' : 'Desconectado'}
                    </span>
                  </div>
                  
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, flex: 1, marginBottom: '1.5rem' }}>
                    {def.description}
                  </p>

                  {isConfiguring ? (
                    <div style={{ width: '100%', display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                      <input 
                        type="text" 
                        placeholder={def.placeholder}
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        style={{ 
                          flex: 1, 
                          padding: '0.6rem', 
                          borderRadius: 'var(--radius-sm)', 
                          border: '1px solid rgba(0,0,0,0.1)',
                          background: 'rgba(255,255,255,0.8)'
                        }}
                      />
                      <button 
                        onClick={() => handleSaveToken(def.id)}
                        disabled={saving}
                        style={{ 
                          padding: '0.6rem 1rem', 
                          background: def.color, 
                          color: '#fff', 
                          border: 'none', 
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          fontWeight: 500
                        }}
                      >
                        {saving ? '...' : 'Guardar'}
                      </button>
                    </div>
                  ) : (
                    <div 
                      onClick={() => { setShowConfig(def.id); setTokenInput(''); }}
                      style={{ marginTop: 'auto', width: '100%', paddingTop: '1rem', borderTop: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', fontSize: '0.85rem', color: def.color, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {activeChannel?.is_active ? 'Actualizar Credenciales' : 'Conectar Canal'} &rarr;
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
