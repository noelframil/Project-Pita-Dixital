"use client";

import Link from "next/link";
import { motion } from 'framer-motion';
import { 
  Activity, 
  Bot, 
  Zap, 
  Database, 
  TrendingUp,
  Clock,
  MessageSquare
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import styles from "./page.module.css";

const mockChartData = [
  { time: '00:00', tokens: 1200 },
  { time: '04:00', tokens: 800 },
  { time: '08:00', tokens: 5000 },
  { time: '12:00', tokens: 12500 },
  { time: '16:00', tokens: 8900 },
  { time: '20:00', tokens: 4200 },
  { time: '23:59', tokens: 2100 },
];

export default function Home() {
  return (
    <div className={styles.dashboardGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem' }}>
      {/* Header / Intro */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ gridColumn: 'span 12', marginBottom: '1rem' }}
      >
        <h2 style={{ fontSize: '2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <Activity size={32} color="var(--primary)" />
          Command Center
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginTop: '0.5rem' }}>
          Centro de control del orquestador ReAct y arquitectura Multi-Agente.
        </p>
      </motion.div>

      {/* Top row: Key Metrics */}
      <motion.div 
        style={{ gridColumn: 'span 4' }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card 
          style={{ 
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between', 
            padding: '2rem', height: '100%',
            background: 'radial-gradient(circle at 100% 100%, rgba(139,92,246,0.1) 0%, transparent 50%), linear-gradient(135deg, var(--surface-dark), #0f1115)' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted-on-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Estado del Núcleo</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(16, 185, 129, 0.1)', padding: '0.3rem 0.8rem', borderRadius: 'var(--radius-pill)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }}></span>
              <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>ÓPTIMO</span>
            </div>
          </div>
          <div style={{ margin: '2.5rem 0' }}>
            <span style={{ fontSize: '4rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', textShadow: '0 0 40px rgba(255,255,255,0.2)' }}>Activo</span>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.5rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted-on-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} /> Latencia Media
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 500, color: 'var(--text-on-dark)', marginTop: '0.25rem' }}>1.25s</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted-on-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Zap size={12} /> Tokens / H
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 500, color: 'var(--text-on-dark)', marginTop: '0.25rem' }}>45.2K</div>
            </div>
          </div>
        </Card>
      </motion.div>

      <motion.div 
        style={{ gridColumn: 'span 8', height: '100%' }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <Card style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={20} color="var(--primary)" />
              Actividad del LLM (Tokens)
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '12px' }}>Últimas 24h</span>
          </div>
          <div style={{ flex: 1, minHeight: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="rgba(255,255,255,0.3)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ background: 'var(--surface-dark)', border: '1px solid var(--glass-border)', borderRadius: '8px', boxShadow: 'var(--shadow-card)' }}
                  itemStyle={{ color: 'var(--foreground)' }}
                />
                <Area type="monotone" dataKey="tokens" stroke="var(--primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorTokens)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </motion.div>

      {/* Bottom row */}
      <motion.div 
        style={{ gridColumn: 'span 4' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <Link href="/subagents">
          <Card hoverEffect style={{ height: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Bot size={22} color="var(--primary)" />
                  Agentes Expertos
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>Delegación activa.</p>
              </div>
              <span style={{ fontSize: '2.5rem', fontWeight: 700 }}>3</span>
            </div>
            <div style={{ marginTop: 'auto', fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 500 }}>Gestionar &rarr;</div>
          </Card>
        </Link>
      </motion.div>

      <motion.div 
        style={{ gridColumn: 'span 4' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        <Link href="/integrations">
          <Card hoverEffect style={{ height: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Zap size={22} color="var(--secondary)" />
                  Integraciones
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>Acciones y webhooks.</p>
              </div>
              <span style={{ fontSize: '2.5rem', fontWeight: 700 }}>7</span>
            </div>
            <div style={{ marginTop: 'auto', fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 500 }}>Configurar &rarr;</div>
          </Card>
        </Link>
      </motion.div>

      <motion.div 
        style={{ gridColumn: 'span 4' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      >
        <Link href="/memory">
          <Card hoverEffect style={{ height: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={22} color="var(--success)" />
                  Memoria RAG
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>Base de conocimiento.</p>
              </div>
              <span style={{ fontSize: '1.8rem', fontWeight: 700 }}>1.4K</span>
            </div>
            <div style={{ marginTop: 'auto', fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 500 }}>Actualizar &rarr;</div>
          </Card>
        </Link>
      </motion.div>
    </div>
  );
}
