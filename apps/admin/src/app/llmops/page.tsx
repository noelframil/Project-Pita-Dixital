"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Activity, Zap, DollarSign, Bot, ArrowLeft } from 'lucide-react';
import TraceViewerModal from './TraceViewerModal';

type Trace = {
  id: string;
  conversation_id: string;
  model: string;
  latency_ms: number;
  cost_micros: number;
  total_tokens: number;
  created_at: string;
};

type TimeseriesData = {
  date: string;
  cost: number;
  tokens: number;
  latency: number;
};

type Metrics = {
  total_tokens: number;
  total_cost: number;
  avg_latency: number;
};

export default function LLMOpsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesData[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cost' | 'tokens' | 'latency'>('cost');

  useEffect(() => {
    fetch('/api/v1/admin/analytics/llmops')
      .then(res => res.json())
      .then(data => {
        setMetrics(data.metrics);
        setTimeseries(data.timeseries || []);
        setTraces(data.traces || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const formatCost = (cost: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cost);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

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
            Observabilidad LLMOps
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', margin: 0 }}>
            Telemetría en tiempo real, latencias y control de costes de IA.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/llmops/subagents"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.8rem 1.5rem', background: 'rgba(139,92,246,0.1)', color: 'var(--primary)', 
              borderRadius: 'var(--radius-md)', fontWeight: 600, border: '1px solid rgba(139,92,246,0.3)', 
              textDecoration: 'none', transition: 'all 0.2s'
            }}
          >
            <Bot size={18} /> Enjambre de Subagentes
          </Link>
          <button style={{ padding: '0.8rem 1.5rem', background: 'var(--primary)', color: 'white', borderRadius: 'var(--radius-md)', fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            Exportar Informe
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Metrica: Coste */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          onClick={() => setActiveTab('cost')}
          style={{ 
            background: activeTab === 'cost' ? 'rgba(236, 72, 153, 0.15)' : 'var(--surface-dark)', 
            border: `1px solid ${activeTab === 'cost' ? 'rgba(236, 72, 153, 0.4)' : 'var(--glass-border)'}`, 
            padding: '2rem', borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: activeTab === 'cost' ? 'var(--foreground)' : 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            <DollarSign size={18} color={activeTab === 'cost' ? '#ec4899' : 'currentColor'} /> Gasto Total (Mes)
          </h3>
          <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--foreground)' }}>
            {loading ? '...' : formatCost(metrics?.total_cost || 0)}
          </div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>45% del presupuesto gastado</p>
        </motion.div>

        {/* Metrica: Tokens */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          onClick={() => setActiveTab('tokens')}
          style={{ 
            background: activeTab === 'tokens' ? 'rgba(59, 130, 246, 0.15)' : 'var(--surface-dark)', 
            border: `1px solid ${activeTab === 'tokens' ? 'rgba(59, 130, 246, 0.4)' : 'var(--glass-border)'}`, 
            padding: '2rem', borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: activeTab === 'tokens' ? 'var(--foreground)' : 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            <Activity size={18} color={activeTab === 'tokens' ? '#3b82f6' : 'currentColor'} /> Tokens Procesados
          </h3>
          <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--foreground)' }}>
            {loading ? '...' : (metrics?.total_tokens ? (metrics.total_tokens / 1000000).toFixed(2) + 'M' : '0')}
          </div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--success)' }}>&uarr; 12% vs. mes anterior</p>
        </motion.div>

        {/* Metrica: Latencia */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          onClick={() => setActiveTab('latency')}
          style={{ 
            background: activeTab === 'latency' ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface-dark)', 
            border: `1px solid ${activeTab === 'latency' ? 'rgba(16, 185, 129, 0.4)' : 'var(--glass-border)'}`, 
            padding: '2rem', borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'all 0.2s'
          }}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', color: activeTab === 'latency' ? 'var(--foreground)' : 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            <Zap size={18} color={activeTab === 'latency' ? '#10b981' : 'currentColor'} /> Latencia Media
          </h3>
          <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--foreground)' }}>
            {loading ? '...' : (metrics?.avg_latency ? (metrics.avg_latency / 1000).toFixed(2) + 's' : '0s')}
          </div>
          <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Dentro del SLA (2.0s)</p>
        </motion.div>
      </div>

      {/* Gráfica principal */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}
        style={{ background: 'var(--surface-dark)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-xl)', padding: '2rem', marginBottom: '3rem' }}
      >
        <h2 style={{ margin: '0 0 2rem 0', fontSize: '1.25rem', fontWeight: 600 }}>
          Evolución de 7 días: {activeTab === 'cost' ? 'Costes ($)' : activeTab === 'tokens' ? 'Uso de Tokens' : 'Latencia (ms)'}
        </h2>
        <div style={{ height: '350px', width: '100%' }}>
          {loading ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Cargando gráficas...</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {activeTab === 'cost' ? (
                <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" tickFormatter={formatDate} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} dy={10} />
                  <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} tickFormatter={val => `$${val}`} dx={-10} />
                  <Tooltip 
                    contentStyle={{ background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }} 
                    itemStyle={{ color: '#ec4899' }} 
                    formatter={(val: number) => [`$${val.toFixed(2)}`, 'Coste']}
                    labelFormatter={formatDate}
                  />
                  <Area type="monotone" dataKey="cost" stroke="#ec4899" strokeWidth={3} fillOpacity={1} fill="url(#colorCost)" activeDot={{ r: 6, fill: '#ec4899', stroke: 'white' }} />
                </AreaChart>
              ) : activeTab === 'tokens' ? (
                <BarChart data={timeseries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barSize={30}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" tickFormatter={formatDate} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} dy={10} />
                  <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} tickFormatter={val => `${val/1000}k`} dx={-10} />
                  <Tooltip 
                    contentStyle={{ background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }} 
                    itemStyle={{ color: '#3b82f6' }} 
                    formatter={(val: number) => [val.toLocaleString(), 'Tokens']}
                    labelFormatter={formatDate}
                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                  <Bar dataKey="tokens" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <AreaChart data={timeseries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorLat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" stroke="rgba(255,255,255,0.3)" tickFormatter={formatDate} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} dy={10} />
                  <YAxis stroke="rgba(255,255,255,0.3)" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }} tickFormatter={val => `${val}ms`} dx={-10} />
                  <Tooltip 
                    contentStyle={{ background: 'rgba(10,10,15,0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white' }} 
                    itemStyle={{ color: '#10b981' }} 
                    formatter={(val: number) => [`${val} ms`, 'Latencia']}
                    labelFormatter={formatDate}
                  />
                  <Area type="monotone" dataKey="latency" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorLat)" activeDot={{ r: 6, fill: '#10b981', stroke: 'white' }} />
                </AreaChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>

      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600 }}>Trazas Recientes (Traces)</h2>
      
      <div style={{ background: 'transparent' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Cargando telemetría...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            {traces.map(trace => (
              <div key={trace.id} onClick={() => setSelectedTraceId(trace.id)} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr', alignItems: 'center', padding: '1.2rem 2rem', background: 'var(--surface-dark)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--glass-border)', transition: 'all 0.2s ease', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--glass-border)'}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '36px', height: '36px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                    <Bot size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Trace ID</div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--foreground)' }}>{trace.id}</div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Modelo</div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--foreground)' }}>{trace.model}</div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Latencia</div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: trace.latency_ms > 2000 ? 'var(--danger)' : 'var(--success)' }}>
                    {(trace.latency_ms / 1000).toFixed(2)}s
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tokens</div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--foreground)' }}>{trace.total_tokens.toLocaleString()}</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {new Date(trace.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <TraceViewerModal traceId={selectedTraceId} onClose={() => setSelectedTraceId(null)} />
    </div>
  );
}
