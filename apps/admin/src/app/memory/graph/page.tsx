"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Network, ZoomIn, ZoomOut, Database } from 'lucide-react';
import styles from '../../clients/page.module.css';

// Mock data to simulate Graph RAG
const nodes = [
  { id: '1', label: 'Manual_Operaciones_2026.pdf', type: 'doc', x: 500, y: 300 },
  { id: '2', label: 'Horario Desayuno', type: 'concept', x: 350, y: 200 },
  { id: '3', label: 'Check-in Tardío', type: 'concept', x: 650, y: 220 },
  { id: '4', label: 'FAQ_Huespedes.docx', type: 'doc', x: 250, y: 450 },
  { id: '5', label: 'Política Mascotas', type: 'concept', x: 200, y: 300 },
  { id: '6', label: 'Tarifas_Temporada_Alta.csv', type: 'doc', x: 750, y: 450 },
  { id: '7', label: 'Precio Hab. Doble', type: 'concept', x: 800, y: 300 },
  { id: '8', label: 'Protocolo Limpieza', type: 'concept', x: 450, y: 150 },
  { id: '9', label: 'Atención VIP', type: 'concept', x: 600, y: 120 },
  { id: '10', label: 'Contacto Emergencias', type: 'concept', x: 350, y: 550 },
  { id: '11', label: 'Política Cancelación', type: 'concept', x: 650, y: 600 },
];

const edges = [
  { source: '1', target: '2' },
  { source: '1', target: '3' },
  { source: '1', target: '8' },
  { source: '1', target: '9' },
  { source: '4', target: '5' },
  { source: '4', target: '2' },
  { source: '4', target: '10' },
  { source: '6', target: '7' },
  { source: '6', target: '11' },
  { source: '1', target: '4' },
  { source: '1', target: '6' },
];

export default function GraphRAGPage() {
  const [zoom, setZoom] = useState(1);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY > 0) {
      setZoom(z => Math.max(0.5, z - 0.1));
    } else {
      setZoom(z => Math.min(2, z + 0.1));
    }
  };

  return (
    <div className={styles.container} style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <header className={styles.header} style={{ marginBottom: '1rem', position: 'relative', zIndex: 10 }}>
        <div>
          <Link href="/memory"
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
            <ArrowLeft size={16} /> Volver a Memoria
          </Link>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ fontSize: '2rem', fontWeight: 600, margin: '0 0 0.5rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >
            <Network size={28} color="var(--primary)" /> Graph RAG Visualizer
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Exploración semántica de la base vectorial. Relaciones inferidas por el AGI.</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.2))} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', color: 'var(--foreground)', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer' }}><ZoomOut size={20} /></button>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.2))} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', color: 'var(--foreground)', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer' }}><ZoomIn size={20} /></button>
        </div>
      </header>

      <div 
        style={{ flex: 1, background: '#0a0a0c', borderRadius: '16px', border: '1px solid var(--glass-border)', overflow: 'hidden', position: 'relative' }}
        onWheel={handleWheel}
      >
        {/* Background Grid */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
          transition: 'transform 0.2s ease-out'
        }} />

        <motion.div
          style={{ width: '100%', height: '100%', position: 'relative' }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: zoom }}
          transition={{ duration: 0.5 }}
        >
          <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
            {edges.map((edge, i) => {
              const source = nodes.find(n => n.id === edge.source)!;
              const target = nodes.find(n => n.id === edge.target)!;
              const isHovered = hoveredNode === source.id || hoveredNode === target.id;
              
              return (
                <motion.line 
                  key={i}
                  x1={source.x} y1={source.y} x2={target.x} y2={target.y}
                  stroke={isHovered ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}
                  strokeWidth={isHovered ? 2 : 1}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1, delay: i * 0.1 }}
                />
              );
            })}
          </svg>

          {nodes.map((node, i) => {
            const isHovered = hoveredNode === node.id;
            const isDoc = node.type === 'doc';
            return (
              <motion.div
                key={node.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', delay: i * 0.05 }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{
                  position: 'absolute',
                  left: node.x,
                  top: node.y,
                  transform: 'translate(-50%, -50%)',
                  cursor: 'pointer',
                  zIndex: isHovered ? 10 : 1
                }}
              >
                <motion.div 
                  animate={{ 
                    boxShadow: isHovered ? `0 0 30px ${isDoc ? 'var(--primary)' : 'var(--success)'}` : 'none',
                    scale: isHovered ? 1.2 : 1
                  }}
                  style={{
                    width: isDoc ? '60px' : '40px',
                    height: isDoc ? '60px' : '40px',
                    borderRadius: '50%',
                    background: isDoc ? 'rgba(139, 92, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    border: `2px solid ${isDoc ? 'var(--primary)' : 'var(--success)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(5px)'
                  }}
                >
                  {isDoc ? <Database size={24} color="var(--primary)"/> : <Network size={16} color="var(--success)"/>}
                </motion.div>
                
                <motion.div 
                  animate={{ opacity: isHovered || isDoc ? 1 : 0.6, y: isHovered ? 5 : 10 }}
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    whiteSpace: 'nowrap',
                    background: 'rgba(0,0,0,0.8)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '0.75rem',
                    color: 'var(--foreground)',
                    pointerEvents: 'none',
                    marginTop: '8px'
                  }}
                >
                  {node.label}
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
