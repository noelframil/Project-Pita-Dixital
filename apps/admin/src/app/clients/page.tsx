"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, Building2, Key, Database, MessageSquare, ShieldAlert } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import WizardOnboarding from './WizardOnboarding';

type Client = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  keys: number;
  entries: number;
  channels: string | null;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const loadClients = () => {
    setLoading(true);
    fetch("/api/v1/admin/clients")
      .then((res) => {
        if (!res.ok) throw new Error("Error fetching clients");
        return res.json();
      })
      .then((data) => {
        setClients(data.clients);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadClients();
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
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
            style={{ fontSize: '2.5rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--foreground)' }}
          >
            Gestor de Autoconfig
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', margin: 0 }}>
            Despliega y gestiona la arquitectura completa de IA para tus clientes (Hoteles, Clínicas, etc.).
          </p>
        </div>
        <motion.button 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsWizardOpen(true)}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '0.5rem', 
            padding: '0.8rem 1.5rem', background: 'var(--primary)', color: 'white', 
            border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600
          }}
        >
          <Plus size={18} /> Nuevo Proyecto AI
        </motion.button>
      </header>

      <WizardOnboarding 
        isOpen={isWizardOpen} 
        onClose={() => setIsWizardOpen(false)} 
        onSuccess={() => {
          setIsWizardOpen(false);
          loadClients();
        }}
      />

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: 'var(--danger)', borderRadius: 'var(--radius-md)', marginBottom: '2rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Cargando proyectos...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
          <AnimatePresence>
            {clients.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '6rem 2rem', background: 'var(--surface-dark)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--glass-border)' }}
              >
                <Building2 size={48} color="var(--text-muted)" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem 0', color: 'var(--foreground)' }}>Ningún proyecto activo</h3>
                <p style={{ color: 'var(--text-muted)', margin: 0 }}>Usa el Autoconfig Wizard para generar tu primer bot con Inteligencia Artificial.</p>
              </motion.div>
            ) : (
              clients.map((client, i) => (
                <motion.div 
                  key={client.id} 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.05 }}
                  style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
                >
                  <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%', cursor: 'pointer', background: 'var(--surface-card)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ 
                          width: '48px', height: '48px', borderRadius: '12px', 
                          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(236, 72, 153, 0.2))', 
                          border: '1px solid rgba(139, 92, 246, 0.3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontWeight: 'bold', fontSize: '1.2rem'
                        }}>
                          {client.name.charAt(0)}
                        </div>
                        <div>
                          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '0 0 0.2rem 0', color: 'var(--foreground)' }}>{client.name}</h3>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block' }}>
                            @{client.slug}
                          </span>
                        </div>
                      </div>
                      <span style={{ 
                        padding: '4px 10px', 
                        borderRadius: '12px', 
                        fontSize: '0.75rem', 
                        fontWeight: 600,
                        background: client.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(161, 161, 170, 0.1)',
                        color: client.is_active ? 'var(--success)' : 'var(--text-muted)',
                        border: `1px solid ${client.is_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(161, 161, 170, 0.2)'}`
                      }}>
                        {client.is_active ? 'ACTIVO' : 'INACTIVO'}
                      </span>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <Database size={16} color="var(--accent)" />
                        {client.entries} docs RAG
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <Key size={16} color="var(--warning)" />
                        {client.keys} API Keys
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                        <MessageSquare size={16} color="var(--info)" />
                        Canales: {client.channels || 'Ninguno'}
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
