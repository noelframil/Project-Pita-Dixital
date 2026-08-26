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
  MessageSquare,
  Brain,
  Globe,
  Megaphone,
  Calculator,
  Briefcase,
  Cpu,
  Dna,
  Scale,
  PackageOpen
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { useState, useEffect } from 'react';
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
  const [learnedRules, setLearnedRules] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/v1/admin/learned-rules')
      .then(res => res.json())
      .then(data => setLearnedRules(data.rules || []))
      .catch(console.error);
  }, []);

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
        style={{ gridColumn: 'span 12', display: 'flex', gap: '1.5rem' }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Lóbulo Frontal Widget */}
        {learnedRules.length > 0 && (
          <div style={{ flex: 1, background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.2)', padding: '1.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)', fontWeight: 600, fontSize: '0.95rem' }}>
              <Brain size={18} /> Lóbulo Frontal Activo (Meta-Prompting)
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>El Agente ha modificado autónomamente su propio código base tras analizar errores en conversaciones pasadas:</div>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--foreground)', fontSize: '0.85rem', fontFamily: 'monospace' }}>
              {learnedRules.map((rule, idx) => (
                <li key={idx} style={{ marginBottom: '0.25rem' }}>{rule}</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* Proactive Insights Lobe */}
        <div style={{ flex: 1, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '1.5rem', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success)', fontWeight: 600, fontSize: '0.95rem' }}>
              <Activity size={18} /> Lóbulo de Insights (Proactivo)
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Sugerencias de estrategia inferidas por el Agente basadas en la telemetría global:</div>
            <ul style={{ margin: 0, paddingLeft: '1.5rem', color: 'var(--success)', fontSize: '0.85rem', fontFamily: 'sans-serif' }}>
              <li style={{ marginBottom: '0.5rem' }}>He notado un 40% de incremento en preguntas sobre mascotas. Sugiero crear una Landing Page específica.</li>
              <li style={{ marginBottom: '0.5rem' }}>La tasa de conversión cae a partir de las 22:00. ¿Activamos promociones nocturnas automáticas?</li>
            </ul>
        </div>
      </motion.div>

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(16, 185, 129, 0.1)', padding: '0.3rem 1rem', borderRadius: 'var(--radius-pill)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div className="status-pulse" style={{ width: '8px', height: '8px' }}>
                <span style={{ background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }}></span>
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600, letterSpacing: '0.05em' }}>ÓPTIMO</span>
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
        <Card style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-card)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={20} color="var(--primary)" />
              Actividad del LLM (Tokens)
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '12px' }}>Últimas 24h</span>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.6}/>
                    <stop offset="50%" stopColor="var(--secondary)" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="var(--secondary)" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="strokeTokens" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--primary)"/>
                    <stop offset="100%" stopColor="var(--secondary)"/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                <XAxis dataKey="time" stroke="rgba(255,255,255,0.2)" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={11} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip 
                  contentStyle={{ background: 'var(--surface-dark)', border: '1px solid var(--border-glow)', borderRadius: '12px', boxShadow: 'var(--shadow-glow)', backdropFilter: 'var(--blur-glass)' }}
                  itemStyle={{ color: 'var(--foreground)' }}
                  cursor={{ stroke: 'var(--primary)', strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.5 }}
                />
                <Area type="monotone" dataKey="tokens" stroke="url(#strokeTokens)" strokeWidth={3} fillOpacity={1} fill="url(#colorTokens)" animationDuration={1500} />
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

      {/* Integraciones Placeholder */}
      <motion.div style={{ gridColumn: 'span 4' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}>
        <Link href="/integrations" style={{ textDecoration: 'none' }}>
          <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', height: '100%' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(234, 179, 8, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={24} color="var(--warning)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 0.25rem 0', color: 'var(--foreground)' }}>Integraciones</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Conecta APIs externas (Stripe, Calendarios).</p>
            </div>
          </Card>
        </Link>
      </motion.div>

      {/* Social Marketing Lobe */}
      <motion.div style={{ gridColumn: 'span 12' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.35 }}>
        <Link href="/social" style={{ textDecoration: 'none' }}>
          <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'linear-gradient(45deg, rgba(236, 72, 153, 0.05), transparent)', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(236, 72, 153, 0.3)' }}>
              <Megaphone size={28} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Lóbulo Social (Community Manager)
                <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(236, 72, 153, 0.2)', color: 'var(--primary)', borderRadius: '10px' }}>PROACTIVO</span>
              </h3>
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>El bot cruza datos de clima e inventario para crear campañas de marketing y publicaciones autónomas en redes.</p>
            </div>
            <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: 'var(--foreground)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>
              Aprobar Posts
            </div>
          </Card>
        </Link>
      </motion.div>

      {/* Accounting ERP Lobe */}
      <motion.div style={{ gridColumn: 'span 12' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.38 }}>
        <Link href="/accounting" style={{ textDecoration: 'none' }}>
          <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'linear-gradient(45deg, rgba(234, 179, 8, 0.05), transparent)', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(234, 179, 8, 0.3)' }}>
              <Calculator size={28} color="#111" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Lóbulo de Contabilidad Autónoma (ERP)
                <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(234, 179, 8, 0.2)', color: 'var(--warning)', borderRadius: '10px' }}>AUTÓNOMO</span>
              </h3>
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>El Agente cruza horas trabajadas con el PMS para pagar nóminas y audita facturas de proveedores previniendo fraudes fiscales.</p>
            </div>
            <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: 'var(--foreground)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>
              Abrir Auditoría
            </div>
          </Card>
        </Link>
      </motion.div>

        {/* B2B Business Lobe */}
        <motion.div style={{ gridColumn: 'span 12' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.39 }}>
          <Link href="/b2b" style={{ textDecoration: 'none' }}>
            <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'linear-gradient(45deg, rgba(139, 92, 246, 0.05), transparent)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(139, 92, 246, 0.3)' }}>
                <Briefcase size={28} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Lóbulo de Negocio (B2B Outbound)
                  <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(139, 92, 246, 0.2)', color: 'var(--secondary)', borderRadius: '10px' }}>AUTÓNOMO</span>
                </h3>
                <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>El Agente negocia comisiones de afiliación por correo electrónico con restaurantes y empresas locales.</p>
              </div>
              <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: 'var(--foreground)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>
                Ver Negociaciones
              </div>
            </Card>
          </Link>
        </motion.div>

        {/* IoT Physical Lobe */}
        <motion.div style={{ gridColumn: 'span 12' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.395 }}>
          <Link href="/iot" style={{ textDecoration: 'none' }}>
            <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'linear-gradient(45deg, rgba(14, 165, 233, 0.05), transparent)', border: '1px solid rgba(14, 165, 233, 0.2)' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--info)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(14, 165, 233, 0.3)' }}>
                <Cpu size={28} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Lóbulo Físico (IoT & Smart Hotel)
                  <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(14, 165, 233, 0.2)', color: 'var(--info)', borderRadius: '10px' }}>OMNIPRESENTE</span>
                </h3>
                <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>El Agente controla la temperatura del edificio y hace mantenimiento predictivo conectándose a los sensores físicos.</p>
              </div>
              <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: 'var(--foreground)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>
                Sensores
              </div>
            </Card>
          </Link>
        </motion.div>

        {/* Simulation Lobe */}
        <motion.div style={{ gridColumn: 'span 12' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.398 }}>
          <Link href="/simulator" style={{ textDecoration: 'none' }}>
            <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'linear-gradient(45deg, rgba(239, 68, 68, 0.05), transparent)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(239, 68, 68, 0.3)' }}>
                <Dna size={28} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Lóbulo de Simulación (Modo Dios)
                  <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)', borderRadius: '10px' }}>MONTECARLO</span>
                </h3>
                <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>El Agente procesa gemelos digitales y predice la curva probabilística de ingresos ante nuevas decisiones de negocio.</p>
              </div>
              <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: 'var(--foreground)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>
                Correr Simulación
              </div>
            </Card>
          </Link>
        </motion.div>

        {/* Legal Lobe */}
        <motion.div style={{ gridColumn: 'span 12' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.399 }}>
          <Link href="/legal" style={{ textDecoration: 'none' }}>
            <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'linear-gradient(45deg, rgba(255, 255, 255, 0.05), transparent)', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(255, 255, 255, 0.1)' }}>
                <Scale size={28} color="var(--background)" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  Lóbulo Legal (Abogado AGI)
                  <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(255, 255, 255, 0.2)', color: 'var(--foreground)', borderRadius: '10px' }}>DEFENSA</span>
                </h3>
                <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>El Agente redacta apelaciones ante fraudes bancarios y actualiza contratos laborales según las últimas normativas del BOE.</p>
              </div>
              <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: 'var(--foreground)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>
                Ver Expedientes
              </div>
            </Card>
          </Link>
        </motion.div>

      {/* Supply Chain Lobe */}
      <motion.div style={{ gridColumn: 'span 12' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.399 }}>
        <Link href="/supply" style={{ textDecoration: 'none' }}>
          <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'linear-gradient(45deg, rgba(2, 132, 199, 0.05), transparent)', border: '1px solid rgba(2, 132, 199, 0.2)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--info)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(2, 132, 199, 0.3)' }}>
              <PackageOpen size={28} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Lóbulo de Cadena de Suministro (Procurement)
                <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(2, 132, 199, 0.2)', color: 'var(--info)', borderRadius: '10px' }}>LOGÍSTICA</span>
              </h3>
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>El Agente gestiona inventario con IoT, busca proveedores locales y ejecuta las compras de forma autónoma.</p>
            </div>
            <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: 'var(--foreground)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>
              Ver Almacén
            </div>
          </Card>
        </Link>
      </motion.div>

      {/* Crawler Intelligence */}
      <motion.div style={{ gridColumn: 'span 12' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}>
        <Link href="/intelligence" style={{ textDecoration: 'none' }}>
          <Card hoverEffect style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'linear-gradient(45deg, rgba(16, 185, 129, 0.05), transparent)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 30px rgba(16, 185, 129, 0.3)' }}>
              <Globe size={28} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Lóbulo de Inteligencia Web (Crawler)
                <span style={{ fontSize: '0.7rem', padding: '2px 8px', background: 'rgba(16,185,129,0.2)', color: 'var(--success)', borderRadius: '10px' }}>AUTÓNOMO</span>
              </h3>
              <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-muted)' }}>El agente rastrea Internet usando Puppeteer para recopilar precios de la competencia y tendencias del mercado en tiempo real.</p>
            </div>
            <div style={{ padding: '0.75rem 1.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', color: 'var(--foreground)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.1)' }}>
              Ver Radar
            </div>
          </Card>
        </Link>
      </motion.div>

      <motion.div 
        style={{ gridColumn: 'span 4' }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      >
        <Link href="/evolution">
          <Card hoverEffect style={{ height: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={22} color="var(--success)" />
                  Auto-Evolución
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>Scripts Sintetizados.</p>
              </div>
              <span style={{ fontSize: '1.8rem', fontWeight: 700 }}>∞</span>
            </div>
            <div style={{ marginTop: 'auto', fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 500 }}>Auditar &rarr;</div>
          </Card>
        </Link>
      </motion.div>
    </div>
  );
}
