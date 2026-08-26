"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Globe, Search, RefreshCw, AlertTriangle, ExternalLink, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import styles from '../clients/page.module.css';

// Mock real-time data
const mockTrackers = [
  { id: 1, target: 'Booking.com', url: 'booking.com/search?q=madrid', status: 'active', lastScrape: 'hace 5 min', findings: 'Precio medio competidores: 145€ (+12%)' },
  { id: 2, target: 'Eventos Locales', url: 'madrid.es/eventos', status: 'active', lastScrape: 'hace 1 hora', findings: 'Concierto detectado este fin de semana. Demanda proyectada alta.' },
  { id: 3, target: 'TripAdvisor Reviews', url: 'tripadvisor.es/hotel_123', status: 'paused', lastScrape: 'hace 12 horas', findings: '3 nuevas reseñas positivas (Limpieza, Desayuno).' }
];

export default function IntelligencePage() {
  const [scanning, setScanning] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    '> Iniciando Lóbulo de Inteligencia Web...', 
    '> Puppeteer Engine [OK]'
  ]);

  const triggerScan = () => {
    setScanning(true);
    setTerminalLogs(prev => [...prev, '> [DISPATCH] Generando agente Crawler...', '> Navegando a Booking.com (Bypass Cloudflare)...']);
    
    setTimeout(() => {
      setTerminalLogs(prev => [...prev, '> Evaluando DOM: Extrayendo 15 nodos de precio...', '> [SUCCESS] Media de precios extraída: 152€']);
      setScanning(false);
    }, 3500);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header} style={{ marginBottom: '2rem' }}>
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
            style={{ fontSize: '2rem', fontWeight: 600, margin: '0 0 0.5rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >
            <Globe size={28} color="var(--success)" /> Inteligencia Web Autónoma (Crawler)
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>El Agente navega por Internet para recopilar inteligencia de mercado en tiempo real.</p>
        </div>
        <button 
          onClick={triggerScan}
          disabled={scanning}
          style={{ 
            display: 'flex', alignItems: 'center', gap: '0.5rem', 
            padding: '0.8rem 1.5rem', background: 'var(--success)', color: 'white', 
            border: 'none', borderRadius: 'var(--radius-md)', cursor: scanning ? 'not-allowed' : 'pointer', fontWeight: 600,
            opacity: scanning ? 0.7 : 1
          }}
        >
          <RefreshCw size={18} className={scanning ? styles.spin : ''} /> {scanning ? 'Escaneando la Web...' : 'Forzar Escaneo Global'}
        </button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem' }}>
        
        {/* Metricas de Mercado */}
        <motion.div style={{ gridColumn: 'span 4' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>
              <span>Precio Medio Competencia</span>
              <Activity size={16} />
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--foreground)' }}>
              145€
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent)', fontSize: '0.85rem' }}>
              <ArrowUpRight size={16} /> +12% respecto a ayer. Sugerimos subir tarifas.
            </div>
          </Card>
        </motion.div>

        <motion.div style={{ gridColumn: 'span 8' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card style={{ padding: '1.5rem', background: 'var(--surface-dark)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', height: '100%' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem' }}>
                <Globe size={16} /> Terminal Neuronal (Web Fetching)
             </div>
             <div style={{ flex: 1, background: '#000', borderRadius: '8px', padding: '1rem', fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--success)', overflowY: 'auto', maxHeight: '150px' }}>
               {terminalLogs.map((log, i) => (
                 <div key={i} style={{ marginBottom: '4px' }}>{log}</div>
               ))}
               {scanning && <div style={{ opacity: 0.5 }}>_</div>}
             </div>
          </Card>
        </motion.div>

        {/* Lista de Trackers */}
        <motion.div style={{ gridColumn: 'span 12', marginTop: '1rem' }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--foreground)' }}>Trabajos de Rastreo Activos (Puppeteer)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {mockTrackers.map((tracker) => (
              <Card key={tracker.id} hoverEffect style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <div style={{ 
                    width: '40px', height: '40px', borderRadius: '10px', 
                    background: tracker.status === 'active' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                  }}>
                    <Search size={20} color={tracker.status === 'active' ? 'var(--success)' : 'var(--text-muted)'} />
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {tracker.target}
                      <a href={`https://${tracker.url}`} target="_blank" style={{ color: 'var(--text-muted)' }}><ExternalLink size={14} /></a>
                    </h4>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Última ejecución: {tracker.lastScrape} &bull; URL: {tracker.url}
                    </div>
                  </div>
                </div>
                
                <div style={{ maxWidth: '400px', padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--primary)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>Extracción del AGI:</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--foreground)' }}>{tracker.findings}</div>
                </div>
              </Card>
            ))}
          </div>
        </motion.div>

      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .${styles.spin} {
          animation: spin 1s linear infinite;
        }
      `}} />
    </div>
  );
}
