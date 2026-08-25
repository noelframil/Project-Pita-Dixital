"use client";

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, 
  UploadCloud, 
  FileText, 
  FileSpreadsheet,
  File,
  Database,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import styles from '../clients/page.module.css';

type KnowledgeDocument = {
  source_ref: string;
  chunks: number;
  last_embedded: string;
};

export default function MemoryPage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = () => {
    fetch('/api/v1/admin/knowledge')
      .then(res => res.json())
      .then(data => {
        setDocuments(data.documents || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await uploadFile(e.dataTransfer.files[0]!);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFile(e.target.files[0]!);
    }
  };

  const uploadFile = async (file: File) => {
    if (!file.name.endsWith('.pdf') && !file.name.endsWith('.txt') && !file.name.endsWith('.md')) {
      alert('Solo se admiten PDF, TXT o MD');
      return;
    }

    setUploading(true);
    setUploadStatus('idle');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/v1/admin/knowledge/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Error al subir');
      
      setUploadStatus('success');
      loadDocuments(); // Reload list
    } catch (err) {
      console.error(err);
      setUploadStatus('error');
    } finally {
      setUploading(false);
      setTimeout(() => setUploadStatus('idle'), 3000);
    }
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
            style={{ fontSize: '2rem', fontWeight: 600, margin: '0 0 0.5rem 0', color: 'var(--foreground)' }}
          >
            Memoria Semántica (RAG)
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Inyecta PDFs y manuales en el cerebro del bot al instante.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Uploader Card */}
        <div style={{ gridColumn: 'span 8' }}>
          <Card 
            style={{ 
              height: '100%', 
              padding: '2rem', 
              display: 'flex', 
              flexDirection: 'column',
              border: isDragging ? '2px dashed var(--primary)' : '1px solid var(--glass-border)',
              background: isDragging ? 'rgba(139, 92, 246, 0.05)' : 'var(--surface-dark)',
              transition: 'all 0.2s ease'
            }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '1rem' }}>
              <AnimatePresence mode="wait">
                {uploading ? (
                  <motion.div key="uploading" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <Loader2 size={48} color="var(--primary)" className={styles.spin} style={{ animation: 'spin 2s linear infinite' }} />
                    <div style={{ color: 'var(--primary)', fontWeight: 600 }}>Procesando y vectorizando documento...</div>
                  </motion.div>
                ) : uploadStatus === 'success' ? (
                  <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <CheckCircle size={48} color="var(--success)" />
                    <div style={{ color: 'var(--success)', fontWeight: 600 }}>¡Vectorizado con éxito!</div>
                  </motion.div>
                ) : uploadStatus === 'error' ? (
                  <motion.div key="error" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <AlertCircle size={48} color="var(--accent)" />
                    <div style={{ color: 'var(--accent)', fontWeight: 600 }}>Fallo al procesar el documento.</div>
                  </motion.div>
                ) : (
                  <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                      width: '80px', height: '80px', borderRadius: '50%', 
                      background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <UploadCloud size={36} color="var(--primary)" />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Arrastra tus archivos aquí</h3>
                      <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.95rem' }}>Soportado: .PDF, .TXT, .MD</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>O también</span>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                    </div>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      style={{ 
                        padding: '0.6rem 1.5rem', background: 'rgba(255,255,255,0.1)', color: 'var(--foreground)', 
                        border: '1px solid rgba(255,255,255,0.2)', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
                        fontWeight: 500, transition: 'background 0.2s'
                      }}
                    >
                      Explorar Archivos
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept=".pdf,.txt,.md"
                      style={{ display: 'none' }} 
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Card>
        </div>

        {/* Stats Card */}
        <div style={{ gridColumn: 'span 4' }}>
          <Card style={{ height: '100%', padding: '2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted-on-dark)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Database size={16} /> Base Vectorial
                </h3>
              </div>
              <div style={{ margin: '2rem 0' }}>
                <span style={{ fontSize: '3.5rem', fontWeight: 700, color: 'var(--primary)', lineHeight: 1 }}>
                  {loading ? '...' : documents.reduce((acc, doc) => acc + Number(doc.chunks), 0)}
                </span>
                <div style={{ fontSize: '1rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Fragmentos Semánticos</div>
              </div>
            </div>
            <div style={{ padding: '1rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--success)', lineHeight: 1.5 }}>
                <strong>Motor Híbrido Activo.</strong> PGVector (Coseno) + FTS (Full-Text) combinados con RRF.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1.5rem', color: 'var(--foreground)' }}>Documentos Ingeridos</h3>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Cargando documentos de memoria...</div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1rem' }}
          >
            {documents.map((doc, i) => (
              <motion.div 
                key={doc.source_ref} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card hoverEffect style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '48px', height: '48px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {doc.source_ref.endsWith('.pdf') ? <FileText size={24} color="var(--primary)" /> : 
                       doc.source_ref.endsWith('.csv') ? <FileSpreadsheet size={24} color="var(--success)" /> : 
                       <File size={24} color="var(--secondary)" />}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 0.25rem 0', wordBreak: 'break-all' }}>{doc.source_ref}</h3>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Actualizado: {new Date(doc.last_embedded).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  <div style={{ textAlign: 'right', marginLeft: '1rem' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--primary)' }}>{doc.chunks}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Chunks</div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
}
