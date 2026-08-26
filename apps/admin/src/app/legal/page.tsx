"use client";

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Scale, ShieldAlert, FileText, CheckCircle2, ChevronRight, Gavel, Search, Download } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import styles from '../clients/page.module.css';

const mockCases = [
  { 
    id: 'DSP-9942', 
    type: 'Chargeback (Disputa)', 
    status: 'drafted', 
    claimant: 'John Doe (Reserva #4092)',
    date: 'Hoy, 09:15',
    amount: '450.00€',
    reason: 'Fraude reportado por cliente (El cliente afirma no haber estado en el hotel).',
    agentResponse: 'Evidencia recabada: IP de la reserva coincide con ubicación. Conexión WiFi del MAC address del cliente registrada en el lobby. Llave NFC usada 14 veces. Carta legal de apelación redactada.'
  },
  { 
    id: 'REG-2023', 
    type: 'Actualización Normativa',
    status: 'resolved', 
    claimant: 'Inspección de Trabajo (BOE)',
    date: 'Ayer, 14:00',
    amount: '--',
    reason: 'Cambio en la ley de registro horario (Decreto 8/2019).',
    agentResponse: 'Contratos actualizados automáticamente con la cláusula 4.b modificada para reflejar la jurisprudencia actual. Firmas pendientes solicitadas a 12 empleados.'
  }
];

export default function LegalPage() {
  const [cases, setCases] = useState(mockCases);
  const [selectedCase, setSelectedCase] = useState(mockCases[0]);
  const [isSending, setIsSending] = useState(false);

  const handleSendAppeal = () => {
    setIsSending(true);
    setTimeout(() => {
      setCases(prev => prev.map(c => c.id === selectedCase.id ? { ...c, status: 'resolved' } : c));
      setSelectedCase(prev => ({ ...prev, status: 'resolved' }));
      setIsSending(false);
    }, 1500);
  };

  return (
    <div className={styles.container} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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
            <Scale size={28} color="var(--foreground)" /> Lóbulo Legal (Abogado AGI)
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>El Agente defiende los intereses jurídicos de la empresa, redacta contratos y apela disputas automáticamente.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '2rem', flex: 1 }}>
        
        {/* Left Column: Docket (List) */}
        <div style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' }}>
             <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
               <Gavel size={18}/> Expedientes Abiertos
             </h2>
             <Search size={16} color="var(--text-muted)"/>
           </div>

           <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
             {cases.map((c) => (
               <Card 
                 key={c.id}
                 hoverEffect
                 onClick={() => setSelectedCase(c)}
                 style={{ 
                   padding: '1.25rem', cursor: 'pointer', 
                   background: selectedCase.id === c.id ? 'var(--surface-dark)' : 'var(--surface-card)',
                   border: selectedCase.id === c.id ? '1px solid var(--foreground)' : '1px solid var(--border-subtle)',
                   borderLeft: c.status === 'drafted' ? '3px solid var(--danger)' : '3px solid var(--success)'
                 }}
               >
                 <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                   <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--foreground)' }}>{c.id}</span>
                   <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.date}</span>
                 </div>
                 <div style={{ fontWeight: 600, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                   {c.status === 'drafted' ? <ShieldAlert size={16} color="var(--danger)"/> : <CheckCircle2 size={16} color="var(--success)"/>}
                   {c.type}
                 </div>
                 <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{c.claimant}</div>
               </Card>
             ))}
           </div>
        </div>

        {/* Right Column: Case Details & Legal Output */}
        <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column' }}>
           <Card style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-dark)' }}>
             <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    Expediente: {selectedCase.id}
                  </h3>
                  <span style={{ fontSize: '0.85rem', padding: '2px 8px', background: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: 'var(--text-muted)' }}>
                    Jurisdicción: España (UE)
                  </span>
                </div>
                <button style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <Download size={14}/> PDF
                </button>
             </div>
             
             <div style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                   <div>
                     <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Demandante / Origen</div>
                     <div style={{ fontWeight: 600 }}>{selectedCase.claimant}</div>
                   </div>
                   <div>
                     <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Riesgo / Importe</div>
                     <div style={{ fontWeight: 600, color: selectedCase.amount !== '--' ? 'var(--danger)' : 'var(--foreground)' }}>{selectedCase.amount}</div>
                   </div>
                </div>

                <div style={{ marginBottom: '2rem', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', borderLeft: '3px solid var(--warning)' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 700, marginBottom: '0.5rem' }}>HECHOS REPORTADOS</div>
                  <div style={{ fontSize: '0.95rem', lineHeight: 1.5 }}>{selectedCase.reason}</div>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.5rem' }}>INVESTIGACIÓN AGI (DISCOVERY)</div>
                  <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.5)', borderRadius: '8px', fontSize: '0.9rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {selectedCase.agentResponse}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--foreground)', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <FileText size={16}/> DOCUMENTO LEGAL GENERADO
                  </div>
                  
                  {selectedCase.status === 'drafted' && (
                    <div style={{ padding: '2rem', background: 'var(--surface-light)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--foreground)', fontFamily: 'serif', lineHeight: 1.6, position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '1rem', right: '1rem', fontSize: '0.7rem', color: 'var(--danger)', border: '1px solid var(--danger)', padding: '2px 6px', borderRadius: '4px' }}>BORRADOR AUTÓNOMO</div>
                      <p><strong>A la atención del Departamento de Resoluciones (Stripe / Entidad Bancaria),</strong></p>
                      <p>Mediante el presente escrito, contestamos formalmente a la disputa de cargo identificada con referencia {selectedCase.id} por importe de {selectedCase.amount}, iniciada bajo la premisa de "cargo no reconocido".</p>
                      <p>Aportamos a continuación las <strong>pruebas irrefutables</strong> (Anexo I) de la prestación efectiva del servicio:
                        <br/>1. Registro criptográfico de acceso (Logs de cerradura NFC) mostrando 14 aperturas.
                        <br/>2. Registro de conexión a la red WiFi interna (MAC Address verificada).
                        <br/>3. Grabación CCTV del Check-in (Time-stamped).
                      </p>
                      <p>En virtud de lo dispuesto en la normativa de servicios de pago, solicitamos la resolución inmediata a nuestro favor y la retrocesión de los fondos retenidos de forma cautelar.</p>
                      <p><em>Fdo. Sistema Experto Legal AGI (En representación de Gran Vía Hotel)</em></p>
                      
                      <button 
                        onClick={handleSendAppeal}
                        disabled={isSending}
                        style={{ marginTop: '2rem', width: '100%', padding: '1rem', background: 'var(--foreground)', color: 'var(--background)', border: 'none', borderRadius: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: isSending ? 'not-allowed' : 'pointer' }}
                      >
                        {isSending ? 'Firmando y Transmitiendo...' : 'Firmar y Enviar Apelación (Stripe API)'}
                      </button>
                    </div>
                  )}

                  {selectedCase.status === 'resolved' && (
                    <div style={{ padding: '2rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid var(--success)', borderRadius: '8px', textAlign: 'center', color: 'var(--success)' }}>
                      <CheckCircle2 size={48} style={{ margin: '0 auto 1rem' }} />
                      <h3 style={{ margin: '0 0 0.5rem 0' }}>Acción Legal Ejecutada</h3>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>El documento ha sido firmado digitalmente y remitido a las autoridades correspondientes.</p>
                    </div>
                  )}
                </div>

             </div>
           </Card>
        </div>

      </div>
    </div>
  );
}
