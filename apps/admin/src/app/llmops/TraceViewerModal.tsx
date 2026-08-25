import React, { useEffect, useState } from 'react';
import styles from './trace.module.css';

type TraceViewerModalProps = {
  traceId: string | null;
  onClose: () => void;
};

type TraceStep = {
  type: 'user' | 'thought' | 'tool_call' | 'tool_result' | 'assistant';
  content: string;
  toolName?: string;
  duration?: string;
};

export default function TraceViewerModal({ traceId, onClose }: TraceViewerModalProps) {
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!traceId) return;
    setLoading(true);
    // Simulated trace fetching
    setTimeout(() => {
      setSteps([
        { type: 'user', content: '¿Tienes alguna habitación libre este fin de semana?' },
        { type: 'thought', content: 'El usuario pregunta por disponibilidad este fin de semana. Necesito calcular las fechas (viernes a domingo) y luego llamar a consultar_disponibilidad.' },
        { type: 'tool_call', toolName: 'consultar_disponibilidad', content: '{"checkin": "2026-08-28", "checkout": "2026-08-30"}', duration: '450ms' },
        { type: 'tool_result', toolName: 'consultar_disponibilidad', content: 'Habitación Doble Superior disponible. Precio 120€/noche.', duration: '12ms' },
        { type: 'thought', content: 'La base de datos confirma disponibilidad. Redactaré la respuesta con tono amable.' },
        { type: 'assistant', content: '¡Hola! Sí, tenemos una Habitación Doble Superior disponible para este fin de semana (del viernes 28 al domingo 30). Su precio es de 120€ por noche. ¿Te gustaría que te envíe un enlace para reservarla?' }
      ]);
      setLoading(false);
    }, 800);
  }, [traceId]);

  if (!traceId) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div>
            <h2>Inspeccionando Traza</h2>
            <p className={styles.traceId}>ID: {traceId}</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div className={styles.loadingState}>Desencriptando memoria...</div>
          ) : (
            <div className={styles.timeline}>
              {steps.map((step, idx) => (
                <div key={idx} className={`${styles.step} ${styles[step.type]}`}>
                  <div className={styles.icon}>
                    {step.type === 'user' && '👤'}
                    {step.type === 'thought' && '💭'}
                    {step.type === 'tool_call' && '🔧'}
                    {step.type === 'tool_result' && '✅'}
                    {step.type === 'assistant' && '🤖'}
                  </div>
                  <div className={styles.stepContent}>
                    <div className={styles.stepHeader}>
                      <span className={styles.stepLabel}>
                        {step.type === 'user' && 'Mensaje del Usuario'}
                        {step.type === 'thought' && 'Pensamiento del Modelo'}
                        {step.type === 'tool_call' && `Llamada a Tool: ${step.toolName}`}
                        {step.type === 'tool_result' && `Respuesta de Tool: ${step.toolName}`}
                        {step.type === 'assistant' && 'Respuesta Final'}
                      </span>
                      {step.duration && <span className={styles.duration}>{step.duration}</span>}
                    </div>
                    <div className={styles.bubble}>
                      {step.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
