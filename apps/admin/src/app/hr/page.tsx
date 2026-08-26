"use client";

import { motion } from 'framer-motion';
import { Users, UserPlus, ShieldAlert, BarChart3, AlertCircle, FileSignature, Mic } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import styles from "../page.module.css";

const STAFF_DATA = [
  { id: 'EMP-001', name: 'Marta Pérez', role: 'Limpieza', status: 'Activa', shift: 'Mañana', performance: 94 },
  { id: 'EMP-002', name: 'Luis Gómez', role: 'Mantenimiento', status: 'Activo', shift: 'Tarde', performance: 88 },
  { id: 'EMP-003', name: 'Ana Torres', role: 'Seguridad', status: 'Activa', shift: 'Noche', performance: 97 },
  { id: 'EMP-004', name: 'Robot Aspirador B2', role: 'Limpieza Autónoma', status: 'Cargando', shift: '24/7', performance: 99 },
];

const ACTIVE_RECRUITMENT = [
  { id: 'REQ-101', role: 'Limpieza Extra (Agosto)', reason: 'Pico de ocupación predicho (98%)', status: 'Entrevistando', progress: 60 },
  { id: 'REQ-102', role: 'Técnico HVAC', reason: 'Fallo detectado IoT Planta 2', status: 'Oferta enviada', progress: 90 },
];

export default function HRPage() {
  return (
    <div className={styles.dashboardGrid} style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem', padding: '2rem' }}>
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ gridColumn: 'span 12', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <Users size={32} color="var(--warning)" />
            Recursos Humanos Autónomos (Workforce AGI)
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginTop: '0.5rem' }}>
            Contratación predictiva, entrevistas por voz IA y gestión de nóminas *Zero-Touch*.
          </p>
        </div>
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem 1rem', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', fontWeight: 600 }}>
          <ShieldAlert size={20} />
          MODO KILL-SWITCH ACTIVO (Requiere aprobación manual)
        </div>
      </motion.div>

      {/* Plantilla Actual */}
      <motion.div style={{ gridColumn: 'span 7' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <Card style={{ padding: '1.5rem', height: '100%', background: 'var(--surface-card)' }}>
          <h3 style={{ fontSize: '1.2rem', margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart3 size={20} color="var(--warning)" />
            Plantilla Activa & Rendimiento
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {STAFF_DATA.map((emp) => (
              <div key={emp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 500, color: 'var(--foreground)' }}>{emp.name} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({emp.id})</span></h4>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Rol: {emp.role} | Turno: {emp.shift}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: emp.status === 'Activa' || emp.status === 'Activo' || emp.status === 'Cargando' ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
                    {emp.status}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Rendimiento: {emp.performance}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Reclutamiento Activo */}
      <motion.div style={{ gridColumn: 'span 5' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <Card style={{ padding: '1.5rem', height: '100%', background: 'linear-gradient(180deg, var(--surface-card), rgba(234, 179, 8, 0.02))' }}>
          <h3 style={{ fontSize: '1.2rem', margin: '0 0 1.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserPlus size={20} color="var(--warning)" />
            Pipeline de Reclutamiento IA
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {ACTIVE_RECRUITMENT.map((req) => (
              <div key={req.id} style={{ padding: '1rem', background: 'rgba(234, 179, 8, 0.05)', borderRadius: '12px', border: '1px solid rgba(234, 179, 8, 0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--warning)' }}>{req.role}</h4>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{req.id}</span>
                </div>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Causa: {req.reason}</p>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  <span style={{ color: 'var(--foreground)' }}>{req.status}</span>
                  <span style={{ color: 'var(--warning)' }}>{req.progress}%</span>
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${req.progress}%`, height: '100%', background: 'var(--warning)' }} />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button style={{ flex: 1, padding: '0.5rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                    <Mic size={14} /> Oír Entrevista
                  </button>
                  <button style={{ flex: 1, padding: '0.5rem', background: 'var(--warning)', border: 'none', borderRadius: '8px', color: 'black', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>
                    <FileSignature size={14} /> Aprobar Contrato
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
            <AlertCircle size={24} color="var(--text-muted)" style={{ marginBottom: '0.5rem' }} />
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>El Lóbulo de Simulación no prevé más necesidades de personal para los próximos 14 días.</p>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
