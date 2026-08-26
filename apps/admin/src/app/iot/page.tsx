"use client";

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Cpu, Thermometer, Zap, Lock, Settings, Activity, AlertTriangle, ShieldCheck, Power } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import styles from '../clients/page.module.css';

const mockSensors = [
  { id: 'HVAC-304', type: 'hvac', room: 'Habitación 304', status: 'optimized', value: '24ºC', action: 'AC apagado. Huésped detectado fuera mediante BLE.', savings: '+2.40€/día' },
  { id: 'PUMP-MAIN', type: 'pump', room: 'Sala de Máquinas', status: 'warning', value: 'Alta Vibración', action: 'Pieza de repuesto (Rodamiento 4X) solicitada a Amazon B2B automáticamente.', savings: 'Prevención Rotura Mayor' },
  { id: 'LOCK-102', type: 'lock', room: 'Habitación 102', status: 'active', value: 'NFC Activo', action: 'Llave digital emitida al Apple Wallet del huésped.', savings: '--' }
];

const MetricCard = ({ title, value, unit, icon: Icon, color }: any) => (
  <Card style={{ padding: '1.5rem', background: 'var(--surface-dark)', borderLeft: `4px solid ${color}` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>{title}</span>
      <Icon size={20} color={color} />
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
      <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--foreground)' }}>{value}</span>
      <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>{unit}</span>
    </div>
  </Card>
);

export default function IoTPage() {
  const [sensors] = useState(mockSensors);

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
            <Cpu size={28} color="var(--info)" /> Lóbulo Físico (IoT & Smart Hotel)
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>El Agente controla la domótica del edificio, optimiza energía y previene fallos físicos de forma autónoma.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <MetricCard title="Ahorro Energético (Mes)" value="845" unit="€" icon={Zap} color="var(--success)" />
        <MetricCard title="Temp. Promedio HVAC" value="23.5" unit="ºC" icon={Thermometer} color="var(--info)" />
        <MetricCard title="Cerraduras Activas" value="42" unit="/ 50" icon={Lock} color="var(--primary)" />
        <MetricCard title="Órdenes B2B (Repuestos)" value="2" unit="pendientes" icon={Settings} color="var(--warning)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '2rem' }}>
        
        {/* Left Column: Events */}
        <div style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={20} color="var(--info)" /> Eventos Físicos Autónomos
            </h2>
          </div>

          {sensors.map((sensor, i) => (
            <motion.div 
              key={sensor.id} 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            >
              <Card style={{ 
                padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
                background: 'var(--surface-card)', border: '1px solid var(--border-subtle)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                       {sensor.type === 'hvac' && <Thermometer size={24} color="var(--info)"/>}
                       {sensor.type === 'pump' && <Settings size={24} color="var(--warning)"/>}
                       {sensor.type === 'lock' && <Lock size={24} color="var(--primary)"/>}
                    </div>
                    <div>
                      <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 600 }}>{sensor.room} <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 400 }}>({sensor.id})</span></h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {sensor.status === 'optimized' && <span style={{ fontSize: '0.8rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><ShieldCheck size={14}/> Optimizado</span>}
                        {sensor.status === 'warning' && <span style={{ fontSize: '0.8rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><AlertTriangle size={14}/> Riesgo Detectado</span>}
                        {sensor.status === 'active' && <span style={{ fontSize: '0.8rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Power size={14}/> Activo</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '1.2rem', fontWeight: 700, color: 'var(--foreground)' }}>
                    {sensor.value}
                  </div>
                </div>
                <div style={{ padding: '1rem', background: 'var(--surface-dark)', borderRadius: '8px', borderLeft: '2px solid var(--info)', fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--foreground)' }}>Acción del Agente:</strong> {sensor.action}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Right Column: Architecture */}
        <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column' }}>
           <Card style={{ padding: '1.5rem', background: 'var(--surface-dark)' }}>
             <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
               <Cpu size={18} color="var(--info)"/> Arquitectura del Edificio
             </h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--info)', marginBottom: '0.25rem' }}>Core System (AGI)</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Procesamiento en tiempo real de 1,200 data points/segundo.</div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Capa de Actuadores (MQTT)</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Conexión directa con relés KNX y Zigbee.</div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Capa Sensorial (BLE/WiFi)</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Termostatos, sensores de presencia y caudalímetros.</div>
                </div>
             </div>
           </Card>
        </div>

      </div>
    </div>
  );
}
