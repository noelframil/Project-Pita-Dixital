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
      padding: '1.5rem 2.5rem',
      background: 'transparent',
      position: 'relative',
      zIndex: 'var(--z-header)'
    }}>
      <h1 style={{ 
        fontSize: '1.5rem', 
        fontWeight: 600, 
        margin: 0, 
        background: 'linear-gradient(90deg, #fff, #a1a1aa)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
      }}>
        Dashboard
      </h1>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <Button variant="primary" size="sm" icon={<Plus size={16} />}>
          Create
        </Button>
        
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          style={{ color: 'var(--text-muted)' }}
        >
          <Search size={20} />
        </motion.button>
        
        <div style={{ position: 'relative' }}>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            style={{ color: showNotifications ? 'var(--primary)' : 'var(--text-muted)', position: 'relative' }}
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell size={20} />
            <span style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: '8px',
              height: '8px',
              background: 'var(--accent)',
              borderRadius: '50%',
              boxShadow: '0 0 10px var(--accent)'
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
                    <div key={notif.id} style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '1rem', cursor: 'pointer', transition: 'background 0.2s', ...({ '&:hover': { background: 'rgba(255,255,255,0.02)' } } as any) }}>
                      <div style={{ 
                        width: '8px', height: '8px', borderRadius: '50%', marginTop: '6px',
                        background: notif.type === 'info' ? 'var(--secondary)' : notif.type === 'success' ? 'var(--success)' : 'var(--primary)'
                      }} />
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.9rem', color: 'var(--foreground)' }}>{notif.title}</h4>
                        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{notif.desc}</p>
                        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>{notif.time}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div style={{ width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)' }}>
          <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>
    </header>
  );
}
