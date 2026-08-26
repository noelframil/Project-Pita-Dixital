"use client";

import { useState } from "react";
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Bell, Plus } from 'lucide-react';
import { Button } from './ui/Button';

export default function Header() {
  const [showNotifications, setShowNotifications] = useState(false);

  const notifications = [
    {
      id: 1,
      title: "Agente ReAct iniciado",
      desc: "El agente de soporte ha comenzado una sesión con un usuario.",
      time: "Hace 2 min",
      type: "info"
    },
    {
      id: 2,
      title: "Webhook WhatsApp",
      desc: "Se ha recibido un nuevo mensaje por WhatsApp.",
      time: "Hace 15 min",
      type: "success"
    },
    {
      id: 3,
      title: "Actualización de Memoria",
      desc: "Se han extraído 3 nuevos hechos semánticos.",
      time: "Hace 1 hora",
      type: "update"
    }
  ];

  return (
    <header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1.5rem 2rem',
      background: 'transparent',
      position: 'relative',
      zIndex: 'var(--z-header)',
      borderBottom: '1px solid var(--glass-border)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Pita Dixital</span>
        <span style={{ color: 'var(--border-subtle)' }}>/</span>
        <h1 style={{ 
          fontSize: '0.85rem', 
          fontWeight: 500, 
          margin: 0, 
          color: 'var(--foreground)'
        }}>
          Dashboard
        </h1>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <button style={{
          display: 'flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.4rem 0.75rem', background: 'var(--foreground)', color: 'var(--background)',
          borderRadius: 'var(--radius-sm)', border: 'none', fontSize: '0.8rem', fontWeight: 500,
          cursor: 'pointer'
        }}>
          <Plus size={14} /> Create
        </button>
        
        <motion.button 
          style={{ color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <Search size={16} />
        </motion.button>
        
        <div style={{ position: 'relative' }}>
          <motion.button 
            style={{ color: showNotifications ? 'var(--foreground)' : 'var(--text-muted)', position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer' }}
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell size={16} />
            <span style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '6px',
              height: '6px',
              background: 'var(--accent)',
              borderRadius: '50%',
            }}></span>
          </motion.button>

          <AnimatePresence>
            {showNotifications && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '1rem',
                  width: '320px',
                  background: 'var(--surface-dark)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-glass)',
                  backdropFilter: 'var(--blur-glass)',
                  overflow: 'hidden'
                }}
              >
                <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>Notificaciones</h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--primary)', cursor: 'pointer' }}>Marcar como leído</span>
                </div>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {notifications.map((notif) => (
                    <div key={notif.id} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.02)', display: 'flex', gap: '0.75rem', cursor: 'pointer' }}>
                      <div style={{ 
                        width: '6px', height: '6px', borderRadius: '50%', marginTop: '6px',
                        background: notif.type === 'info' ? 'var(--secondary)' : notif.type === 'success' ? 'var(--success)' : 'var(--primary)'
                      }} />
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.85rem', fontWeight: 500, color: 'var(--foreground)' }}>{notif.title}</h4>
                        <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{notif.desc}</p>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' }}>{notif.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--glass-border)' }}>
          <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>
    </header>
  );
}
