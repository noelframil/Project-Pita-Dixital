"use client";

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Calculator, TrendingUp, AlertOctagon, CheckCircle2, Clock, PlayCircle, Users } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import styles from '../clients/page.module.css';

const mockPayroll = [
  { id: 1, name: 'María García', role: 'Recepción', hours: 160, overtime: 12, total: 1850.50, status: 'ready' },
  { id: 2, name: 'Carlos Ruiz', role: 'Mantenimiento', hours: 155, overtime: 0, total: 1600.00, status: 'ready' },
  { id: 3, name: 'Laura Gómez', role: 'Limpieza', hours: 160, overtime: 20, total: 1720.00, status: 'anomaly_detected', reason: 'Horas extra exceden el límite legal mensual (20h > 15h)' }
];

const mockInvoices = [
  { id: 'FAC-2491', supplier: 'Lavandería Express', amount: 845.20, date: '2023-10-25', status: 'ready' },
  { id: 'FAC-2492', supplier: 'Proveedor Desconocido', amount: 3500.00, date: '2023-10-26', status: 'fraud_alert', reason: 'IBAN modificado recientemente y CIF no coincide con BBDD del Gobierno.' }
];

export default function AccountingLobePage() {
  const [payroll, setPayroll] = useState(mockPayroll);
  const [invoices, setInvoices] = useState(mockInvoices);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRunPayroll = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setPayroll(prev => prev.map(p => p.status === 'ready' ? { ...p, status: 'paid' } : p));
      setIsProcessing(false);
    }, 2000);
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
            <Calculator size={28} color="var(--warning)" /> Lóbulo de Contabilidad Autónoma (ERP)
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>El Agente audita facturas, previene fraudes y automatiza la ejecución de nóminas.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '2rem' }}>
        
        {/* Left Column: Payroll */}
        <div style={{ gridColumn: 'span 8', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card style={{ padding: '1.5rem', background: 'var(--surface-dark)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={20} color="var(--primary)"/> Nóminas del Mes
              </h2>
              <button 
                onClick={handleRunPayroll}
                disabled={isProcessing}
                style={{ padding: '0.5rem 1rem', background: 'var(--success)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isProcessing ? 'not-allowed' : 'pointer' }}
              >
                {isProcessing ? <Clock size={16} className="animate-spin" /> : <PlayCircle size={16} />}
                {isProcessing ? 'Ejecutando Pagos SEPA...' : 'Ejecutar Pagos Válidos'}
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {payroll.map((p, i) => (
                <motion.div key={p.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{p.name}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.role} &bull; {p.hours}h base + {p.overtime}h extra</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{p.total.toFixed(2)}€</div>
                    {p.status === 'ready' && <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Clock size={14}/> Pendiente</span>}
                    {p.status === 'paid' && <span style={{ color: 'var(--success)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', background: 'rgba(16,185,129,0.1)', borderRadius: '4px' }}><CheckCircle2 size={14}/> Pagado</span>}
                    {p.status === 'anomaly_detected' && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{ color: 'var(--danger)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '4px' }}><AlertOctagon size={14}/> Anomalía Legal</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--danger)', marginTop: '0.25rem', maxWidth: '200px', textAlign: 'right' }}>{p.reason}</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Column: Fraud Detection */}
        <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
           <Card style={{ padding: '1.5rem', background: 'linear-gradient(45deg, rgba(239, 68, 68, 0.05), transparent)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertOctagon size={20} /> Auditoría de Facturas (Antifraude)
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {invoices.map((inv) => (
                  <div key={inv.id} style={{ padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: inv.status === 'fraud_alert' ? '1px solid var(--danger)' : '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontWeight: 600 }}>{inv.supplier}</span>
                      <span style={{ fontWeight: 700, color: inv.status === 'fraud_alert' ? 'var(--danger)' : 'var(--foreground)' }}>{inv.amount.toFixed(2)}€</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Ref: {inv.id} &bull; {inv.date}</div>
                    {inv.status === 'fraud_alert' && (
                       <div style={{ padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--danger)', lineHeight: 1.4 }}>
                         <strong>BLOQUEADO POR AGI:</strong> {inv.reason}
                       </div>
                    )}
                    {inv.status === 'ready' && (
                       <div style={{ color: 'var(--success)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                         <CheckCircle2 size={12}/> Verificado contra AEAT
                       </div>
                    )}
                  </div>
                ))}
              </div>
           </Card>
        </div>

      </div>
    </div>
  );
}
