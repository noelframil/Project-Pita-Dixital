"use client";

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Briefcase, Mail, CheckCircle2, TrendingUp, Handshake, Filter, MessageSquare, AlertCircle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import styles from '../clients/page.module.css';

const mockLeads = [
  { id: 1, name: 'Restaurante El Patio', category: 'Gastronomía', status: 'negotiating', lastContact: 'Hoy, 10:30', email: 'hola@elpatio.es', commission: '12%', agentStatus: 'Esperando respuesta del restaurante sobre la contraoferta del 15%.' },
  { id: 2, name: 'Madrid City Tours', category: 'Actividades', status: 'signed', lastContact: 'Ayer, 16:45', email: 'partners@madridtours.com', commission: '20%', agentStatus: 'Acuerdo cerrado digitalmente. Añadido al motor de recomendaciones del hotel.' },
  { id: 3, name: 'Eco Rent-a-Car', category: 'Transporte', status: 'contacted', lastContact: 'Hace 2 días', email: 'b2b@ecorent.es', commission: '--', agentStatus: 'Primer email frío enviado presentando volumen de huéspedes mensuales.' },
  { id: 4, name: 'Spa Oasis', category: 'Bienestar', status: 'identified', lastContact: '--', email: 'info@spaoasis.es', commission: '--', agentStatus: 'Identificado vía web scraping. En cola para redactar email personalizado.' }
];

const PipelineStage = ({ title, count, color }: { title: string, count: number, color: string }) => (
  <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', borderTop: `3px solid ${color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-muted)' }}>{title}</span>
    <span style={{ background: color, color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 700 }}>{count}</span>
  </div>
);

export default function B2BPage() {
  const [leads, setLeads] = useState(mockLeads);
  const [selectedLead, setSelectedLead] = useState(mockLeads[0]);

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
            <Briefcase size={28} color="var(--secondary)" /> Lóbulo de Negocio (B2B Outbound)
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>El Agente actúa como tu equipo de ventas, contactando empresas locales para negociar comisiones por afiliación.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ gridColumn: 'span 3' }}><PipelineStage title="Identificados (Scraping)" count={12} color="var(--text-muted)"/></div>
        <div style={{ gridColumn: 'span 3' }}><PipelineStage title="Contactados (Email)" count={8} color="var(--primary)"/></div>
        <div style={{ gridColumn: 'span 3' }}><PipelineStage title="En Negociación (LLM)" count={4} color="var(--warning)"/></div>
        <div style={{ gridColumn: 'span 3' }}><PipelineStage title="Acuerdos Firmados" count={2} color="var(--success)"/></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '2rem' }}>
        
        {/* Left Column: CRM List */}
        <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>CRM Autónomo</h2>
            <button style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer' }}><Filter size={16}/></button>
          </div>

          {leads.map((lead, i) => (
            <motion.div 
              key={lead.id} 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} 
              onClick={() => setSelectedLead(lead)}
              style={{ cursor: 'pointer' }}
            >
              <Card style={{ 
                padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: selectedLead.id === lead.id ? 'var(--surface-dark)' : 'var(--surface-card)',
                border: selectedLead.id === lead.id ? '1px solid var(--secondary)' : '1px solid var(--border-subtle)',
                transition: 'all 0.2s'
              }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                     {lead.status === 'signed' ? <Handshake size={20} color="var(--success)"/> : <Briefcase size={20} color="var(--secondary)"/>}
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 600 }}>{lead.name}</h3>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '2px 8px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>{lead.category}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: lead.status === 'signed' ? 'var(--success)' : 'var(--foreground)' }}>Comisión: {lead.commission}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{lead.lastContact}</div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Right Column: Negotiation Thread */}
        <div style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column' }}>
           <Card style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-dark)' }}>
             <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.02)' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <MessageSquare size={18} color="var(--secondary)"/> Hilo de Negociación (Auditoría)
                </h3>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>Prospecto: <strong>{selectedLead.name}</strong></p>
             </div>
             
             <div style={{ padding: '1.5rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
                <div style={{ padding: '1rem', background: 'rgba(139, 92, 246, 0.1)', borderLeft: '3px solid var(--secondary)', borderRadius: '4px' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--secondary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <TrendingUp size={14} /> Estado Mental del Agente
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--foreground)' }}>{selectedLead.agentStatus}</p>
                </div>

                {selectedLead.status === 'negotiating' && (
                  <>
                    <div style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
                       <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Agente B2B (Email Enviado)</div>
                       <div style={{ padding: '1rem', background: 'var(--surface-card)', border: '1px solid var(--glass-border)', borderRadius: '8px 8px 8px 0', fontSize: '0.9rem', color: 'var(--foreground)', lineHeight: 1.5 }}>
                         Hola equipo de El Patio,<br/><br/>Somos el Hotel Gran Vía. Tenemos una media de 500 huéspedes mensuales que buscan donde cenar. Nos gustaría incluiros en nuestro motor de recomendaciones AGI. ¿Estaríais abiertos a un acuerdo de afiliación del 15% por cada mesa derivada a través de nuestro asistente?
                       </div>
                    </div>
                    
                    <div style={{ alignSelf: 'flex-end', maxWidth: '90%' }}>
                       <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textAlign: 'right' }}>Restaurante (Email Recibido)</div>
                       <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '8px 8px 0 8px', fontSize: '0.9rem', color: 'var(--foreground)', lineHeight: 1.5 }}>
                         Buenos días. Nos parece muy interesante. Sin embargo, nuestros márgenes son ajustados. Podríamos ofrecer un 10%.
                       </div>
                    </div>

                    <div style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
                       <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Mail size={12}/> Redactando respuesta (Autónomo)...</div>
                       <div style={{ padding: '1rem', background: 'var(--surface-card)', border: '1px solid var(--secondary)', borderRadius: '8px 8px 8px 0', fontSize: '0.9rem', color: 'var(--foreground)', lineHeight: 1.5, opacity: 0.8 }}>
                         Comprendo. ¿Qué tal si lo cerramos en un 12% y nos comprometemos a poneros como recomendación Top 1 los viernes y sábados?
                       </div>
                    </div>
                  </>
                )}

                {selectedLead.status === 'signed' && (
                   <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                      <CheckCircle2 size={48} color="var(--success)" style={{ margin: '0 auto 1rem' }} />
                      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--foreground)' }}>Acuerdo Cerrado (20%)</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>El agente ha añadido la API del partner al sistema de recomendaciones de los huéspedes.</p>
                   </div>
                )}

                {selectedLead.status === 'contacted' && (
                   <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                      <Mail size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--foreground)' }}>Esperando Respuesta</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>El Agente enviará un follow-up automático en 3 días si no hay respuesta.</p>
                   </div>
                )}

                {selectedLead.status === 'identified' && (
                   <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                      <AlertCircle size={48} color="var(--warning)" style={{ margin: '0 auto 1rem', opacity: 0.8 }} />
                      <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--foreground)' }}>Análisis de Viabilidad</h3>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>El Agente está investigando los ratings de TripAdvisor de este lugar antes de enviar el correo.</p>
                   </div>
                )}

             </div>
           </Card>
        </div>

      </div>
    </div>
  );
}
