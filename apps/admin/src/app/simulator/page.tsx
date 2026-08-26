"use client";

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Dna, Play, RotateCcw, Crosshair, BarChart3, CloudRain, Sun, Banknote, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import styles from '../clients/page.module.css';

export default function SimulatorPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<any>(null);
  const [scenario, setScenario] = useState('pricing_heatwave');

  const runSimulation = () => {
    setIsRunning(true);
    setResults(null);
    setProgress(0);
    
    // Simulate Montecarlo processing
    let current = 0;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 15) + 5;
      if (current >= 100) {
        clearInterval(interval);
        setProgress(100);
        setTimeout(() => {
          setIsRunning(false);
          setResults({
            simulationsRun: 15420,
            confidence: '94.2%',
            projectedRevenue: '+18.5%',
            riskLevel: 'Moderado',
            insight: 'Subir los precios un 15% durante la ola de calor proyectada maximiza los ingresos. La elasticidad de la demanda se reduce cuando la temperatura supera los 38ºC.'
          });
        }, 500);
      } else {
        setProgress(current);
      }
    }, 200);
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
            <Dna size={28} color="var(--danger)" /> Lóbulo de Simulación (Modo Dios)
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>El Agente usa simulaciones de Montecarlo en el Gemelo Digital para predecir el futuro empresarial.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '2rem', flex: 1 }}>
        
        {/* Left Column: Input */}
        <div style={{ gridColumn: 'span 5', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
           <Card style={{ padding: '1.5rem', background: 'var(--surface-dark)' }}>
              <h2 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                 <Crosshair size={20} color="var(--danger)" /> Definir Hipótesis (Input)
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>Seleccionar Escenario Base</label>
                <select 
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                  disabled={isRunning}
                  style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', color: 'var(--foreground)', border: '1px solid var(--border-subtle)', borderRadius: '8px', outline: 'none' }}
                >
                  <option value="pricing_heatwave">Estrategia de Precios vs Ola de Calor (Agosto)</option>
                  <option value="staffing">Aumento de Personal Limpieza (+2 FTE)</option>
                  <option value="marketing">Inversión en Ads de 5,000€ (Black Friday)</option>
                </select>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                   <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Variables Ambientales</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}><Sun size={16} color="var(--warning)"/> Ola de Calor (>38ºC)</div>
                   </div>
                   <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Decisión AGI</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}><Banknote size={16} color="var(--success)"/> +15% Subida Precio</div>
                   </div>
                </div>

                <button 
                  onClick={runSimulation}
                  disabled={isRunning}
                  style={{ 
                    marginTop: '2rem', width: '100%', padding: '1rem', 
                    background: isRunning ? 'var(--surface-light)' : 'var(--danger)', 
                    color: 'white', border: 'none', borderRadius: '8px', 
                    fontWeight: 600, fontSize: '1.1rem', cursor: isRunning ? 'not-allowed' : 'pointer',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
                    transition: 'all 0.2s'
                  }}
                >
                  {isRunning ? <RotateCcw size={20} className="animate-spin" /> : <Play size={20} />}
                  {isRunning ? 'Colapsando Ondas de Probabilidad...' : 'Ejecutar Simulación Montecarlo'}
                </button>
              </div>
           </Card>
        </div>

        {/* Right Column: Console & Results */}
        <div style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column' }}>
           <Card style={{ padding: '2rem', display: 'flex', flexDirection: 'column', height: '100%', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.05), rgba(0,0,0,0.5))', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
             {!isRunning && !results && (
               <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <Dna size={64} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                  <p style={{ fontSize: '1.2rem', textAlign: 'center', maxWidth: '400px' }}>
                    Esperando parámetros para instanciar el Motor Multiverso.
                  </p>
               </div>
             )}

             {isRunning && (
               <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                 <div style={{ width: '100%', maxWidth: '400px' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', color: 'var(--danger)', fontWeight: 600 }}>
                     <span>Calculando futuros posibles...</span>
                     <span>{progress}%</span>
                   </div>
                   <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${progress}%`, height: '100%', background: 'var(--danger)', transition: 'width 0.2s' }}></div>
                   </div>
                   <div style={{ marginTop: '2rem', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                     <div>&gt; Instanciando Gemelo Digital... OK</div>
                     <div>&gt; Inyectando datos meteorológicos... OK</div>
                     <div>&gt; Resolviendo ecuación de elasticidad de demanda...</div>
                     {progress > 50 && <div>&gt; Analizando {Math.floor(progress * 150)} universos paralelos...</div>}
                   </div>
                 </div>
               </div>
             )}

             {results && !isRunning && (
               <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)' }}>
                     <BarChart3 size={24} /> Resultados de la Simulación
                  </h3>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                    <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.5)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Universos Simulados</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{results.simulationsRun.toLocaleString()}</div>
                    </div>
                    <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.5)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Impacto en Ingresos</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--success)' }}>{results.projectedRevenue}</div>
                    </div>
                    <div style={{ padding: '1.5rem', background: 'rgba(0,0,0,0.5)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Confianza (IA)</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--info)' }}>{results.confidence}</div>
                    </div>
                  </div>

                  <div style={{ padding: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid var(--danger)', borderRadius: '4px', flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--danger)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <AlertTriangle size={16}/> Veredicto del AGI
                    </div>
                    <p style={{ margin: 0, fontSize: '1.2rem', lineHeight: 1.6, color: 'var(--foreground)' }}>
                      {results.insight}
                    </p>
                  </div>
               </motion.div>
             )}
           </Card>
        </div>

      </div>
    </div>
  );
}
