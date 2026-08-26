"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Brain, Cpu, Database, Bot, Zap, Plus } from 'lucide-react';
import styles from '../../clients/page.module.css';

export default function SwarmCanvasPage() {
  const [subagents, setSubagents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeComm, setActiveComm] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/v1/admin/subagents')
      .then(res => res.json())
      .then(data => {
        setSubagents(data.subagents || []);
        setLoading(false);
      })
      .catch(console.error);

    // Simulate real-time inter-agent communication pulses
    const interval = setInterval(() => {
      setActiveComm(Math.floor(Math.random() * 3));
      setTimeout(() => setActiveComm(null), 1000);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.container} style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <header className={styles.header} style={{ marginBottom: '1rem', position: 'relative', zIndex: 10 }}>
        <div>
          <Link href="/subagents"
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
            <ArrowLeft size={16} /> Volver a Lista de Agentes
          </Link>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ fontSize: '2rem', fontWeight: 600, margin: '0 0 0.5rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >
            <Cpu size={28} color="var(--primary)" /> Topología de Enjambre (Swarm Canvas)
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Visualización en tiempo real de la arquitectura multi-agente y delegación de tareas.</p>
        </div>
      </header>

      <div 
        style={{ flex: 1, background: '#0a0a0c', borderRadius: '16px', border: '1px solid var(--glass-border)', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {/* Background Radial */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%', width: '800px', height: '800px',
          background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, rgba(0,0,0,0) 70%)',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none'
        }} />

        {/* Orchestrator Node (Center) */}
        <motion.div
          style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring' }}
        >
          <div style={{ width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '2px solid var(--primary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', boxShadow: '0 0 40px rgba(139, 92, 246, 0.3)' }}>
            <Brain size={48} color="var(--primary)" />
            <span style={{ marginTop: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>Orquestador</span>
          </div>
          {/* Pulsing ring */}
          <motion.div 
            style={{ position: 'absolute', top: -10, left: -10, right: -10, bottom: -10, borderRadius: '50%', border: '1px solid var(--primary)' }}
            animate={{ scale: [1, 1.5, 2], opacity: [0.5, 0, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
          />
        </motion.div>

        {/* Subagent Nodes */}
        {!loading && subagents.map((sa, i) => {
          const angle = (i * (360 / Math.max(3, subagents.length))) * (Math.PI / 180);
          const radius = 250;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const isActiveComm = activeComm === i;

          return (
            <motion.div
              key={sa.id}
              style={{ position: 'absolute', top: `calc(50% + ${y}px)`, left: `calc(50% + ${x}px)`, transform: 'translate(-50%, -50%)', zIndex: 5 }}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', delay: i * 0.2 }}
            >
              {/* Communication line to center */}
              <svg style={{ position: 'absolute', width: '200vw', height: '200vh', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: -1 }}>
                 <motion.line 
                   x1="50vw" y1="50vh"
                   x2={`calc(50vw - ${x}px)`} y2={`calc(50vh - ${y}px)`}
                   stroke={isActiveComm ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}
                   strokeWidth={isActiveComm ? 3 : 1}
                   initial={{ pathLength: 0 }}
                   animate={{ pathLength: 1 }}
                 />
                 {isActiveComm && (
                   <motion.circle
                     r="4"
                     fill="var(--primary)"
                     initial={{ cx: '50vw', cy: '50vh' }}
                     animate={{ cx: `calc(50vw - ${x}px)`, cy: `calc(50vh - ${y}px)` }}
                     transition={{ duration: 0.5 }}
                   />
                 )}
              </svg>

              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(255,255,255,0.03)', border: `2px solid ${isActiveComm ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)', transition: 'border-color 0.3s' }}>
                {sa.name.includes('Contable') ? <Zap size={24} color="var(--success)" /> : <Bot size={24} color="var(--secondary)" />}
              </div>
              <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '10px', background: 'rgba(0,0,0,0.8)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--foreground)' }}>
                {sa.name}
              </div>
            </motion.div>
          );
        })}

      </div>
    </div>
  );
}
