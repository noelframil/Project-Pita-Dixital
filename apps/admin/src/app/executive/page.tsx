import React from 'react';
import Link from 'next/link';
import styles from './page.module.css';

export default function ExecutivePage() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <Link href="/"
            style={{
              color: 'var(--text-muted)',
              marginBottom: '0.5rem',
              display: 'inline-block',
              fontSize: '0.9rem',
              textDecoration: 'none'
            }}>
            &larr; Volver al Dashboard
          </Link>
          <h1 className={styles.title}>Asistente Ejecutivo (AI)</h1>
          <p style={{ color: 'var(--text-muted)' }}>Supervisa los correos procesados y las citas agendadas por el Orquestador.</p>
        </div>
      </header>

      <div className={styles.grid}>
        {/* AI Inbox */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>✉️ Bandeja de Entrada AI</h2>
            <span className={styles.badge}>2 Pendientes de Revisión</span>
          </div>
          <div className={styles.emailList}>
            {/* Email 1: Draft */}
            <div className={styles.emailCard}>
              <div className={styles.emailHeader}>
                <span className={styles.emailSender}>cliente.vip@empresa.com</span>
                <span className={styles.emailTime}>Hace 10 min</span>
              </div>
              <div className={styles.emailSubject}>Re: Propuesta Comercial 2026</div>
              <div className={styles.emailSnippet}>
                "Hola Javi, nos encaja la propuesta pero necesitamos ajustar las fechas del kickoff al 15 de septiembre. ¿Podemos agendar una llamada rápida para verlo?"
              </div>
              <div className={styles.emailAction}>
                <span className={styles.actionDraft}>📝 Borrador Generado</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>Esperando aprobación para enviar y agendar.</span>
              </div>
            </div>

            {/* Email 2: Sent */}
            <div className={styles.emailCard}>
              <div className={styles.emailHeader}>
                <span className={styles.emailSender}>proveedor.servicios@tech.io</span>
                <span className={styles.emailTime}>Hoy, 09:30 AM</span>
              </div>
              <div className={styles.emailSubject}>Factura Mensual - Agosto</div>
              <div className={styles.emailSnippet}>
                "Adjuntamos la factura correspondiente a los servicios de nube de este mes..."
              </div>
              <div className={styles.emailAction}>
                <span className={styles.actionSent}>✅ Respondido Automáticamente</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>"Gracias, factura enviada a contabilidad."</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Calendar */}
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>📅 Próximas Citas</h2>
          </div>
          <div className={styles.eventList}>
            <div className={styles.eventCard}>
              <div className={styles.eventTime}>
                <span className={styles.timeHour}>10:00</span>
                <span className={styles.timeAmPm}>AM</span>
              </div>
              <div className={styles.eventDetails}>
                <h4>Llamada de Onboarding</h4>
                <div className={styles.eventAttendees}>👤 carlos.m@cliente.com</div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--primary)' }}>Agendado por IA hace 2 horas</div>
              </div>
            </div>

            <div className={styles.eventCard}>
              <div className={styles.eventTime}>
                <span className={styles.timeHour}>04:30</span>
                <span className={styles.timeAmPm}>PM</span>
              </div>
              <div className={styles.eventDetails}>
                <h4>Revisión de Proyecto</h4>
                <div className={styles.eventAttendees}>👤 equipo@interno.com</div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--primary)' }}>Agendado por IA ayer</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
