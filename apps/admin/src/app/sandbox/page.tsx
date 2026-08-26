"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Terminal, Settings, Wrench, RefreshCw, User, Bot, Mic, Image as ImageIcon, X, Loader2, Cpu, Eye, Activity, Headphones } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import VoiceModeModal from './VoiceModeModal';
import styles from '../clients/page.module.css';

type Client = {
  id: string;
  name: string;
  slug: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tools?: { tool: string; input: any }[];
  uiComponents?: any[];
  latency?: number;
  timestamp: Date;
  imageUrl?: string;
  audioUrl?: string;
  steps?: any[];
};

const DynamicWidget = ({ ui }: { ui: any }) => {
  if (ui.type === 'html_app') {
    return (
      <div style={{ background: 'var(--surface-dark)', padding: '0', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginTop: '0.5rem', overflow: 'hidden' }}>
        <div style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--danger)' }}></div>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--warning)' }}></div>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--success)' }}></div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>Artifact: {ui.props.title || 'Generado por AGI'}</span>
        </div>
        <iframe
          srcDoc={ui.props.html_code}
          style={{ width: '100%', height: ui.props.height || '300px', border: 'none', background: '#fff' }}
          sandbox="allow-scripts"
        />
      </div>
    );
  }
  if (ui.type === 'calendar') {
    return (
      <div style={{ background: 'var(--surface-dark)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginTop: '0.5rem' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>📅 {ui.props.title || 'Calendario Interactivo'}</h4>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {(ui.props.dates || ['10:00 AM', '11:30 AM', '04:00 PM']).map((d: string, i: number) => (
            <button key={i} style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>{d}</button>
          ))}
        </div>
      </div>
    );
  }
  if (ui.type === 'chart') {
    return (
      <div style={{ background: 'var(--surface-dark)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginTop: '0.5rem' }}>
        <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--success)' }}>📊 {ui.props.title || 'Gráfica de Datos'}</h4>
        <div style={{ display: 'flex', height: '100px', alignItems: 'flex-end', gap: '0.5rem', borderBottom: '1px solid var(--text-muted)' }}>
          {(ui.props.data || [40, 70, 30, 90, 50]).map((val: number, i: number) => (
            <div key={i} style={{ width: '100%', background: 'var(--success)', height: `${val}%`, borderRadius: '4px 4px 0 0' }}></div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', border: '1px dashed var(--border-subtle)', marginTop: '0.5rem' }}>
      🧩 Widget: <strong>{ui.type}</strong>
      <pre style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>{JSON.stringify(ui.props, null, 2)}</pre>
    </div>
  );
};

const CognitiveStepsView = ({ steps }: { steps: any[] }) => {
  if (!steps || steps.length === 0) return null;
  return (
    <div style={{ 
      marginTop: '1rem', 
      padding: '1rem',
      background: 'rgba(0,0,0,0.4)',
      border: '1px solid rgba(16, 185, 129, 0.2)',
      borderRadius: '8px',
      fontFamily: 'monospace',
      fontSize: '0.8rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem'
    }}>
      <div style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 600 }}>
        <Cpu size={14} /> Matrix Mode: Cognitive Trace
      </div>
      {steps.map((step, i) => (
        <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
          {step.type === 'thought' && (
            <div style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--primary)', marginRight: '0.5rem' }}>[THOUGHT]</span>
              {step.content}
            </div>
          )}
          {step.type === 'tool_call' && (
            <div style={{ color: 'var(--warning)', marginTop: '0.25rem' }}>
              <span style={{ color: 'var(--warning)', marginRight: '0.5rem' }}>[ACTION]</span>
              Ejecutando `{step.tool}`({JSON.stringify(step.input)})
            </div>
          )}
          {step.type === 'tool_result' && (
            <div style={{ color: 'var(--success)', marginTop: '0.25rem', paddingLeft: '1rem', borderLeft: '1px solid rgba(16,185,129,0.3)' }}>
              <span style={{ color: 'var(--success)', marginRight: '0.5rem' }}>[OBSERVATION]</span>
              {typeof step.result === 'string' ? step.result.substring(0, 100) + '...' : JSON.stringify(step.result).substring(0, 100) + '...'}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
};

export default function SandboxPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [overrideVars, setOverrideVars] = useState<string>('{"guest_name": "Ejemplo"}');
  const [showMetadata, setShowMetadata] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [showVoiceMode, setShowVoiceMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Multimodal State
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/v1/admin/clients')
      .then(res => res.json())
      .then(data => {
        const fetched = data.clients || [];
        setClients(fetched);
        if (fetched.length > 0) {
          setSelectedClient(fetched[0].id);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setRecordingTime(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setSelectedImage(file);
      setImagePreviewUrl(URL.createObjectURL(file));
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          stream.getTracks().forEach(track => track.stop());
          await sendMultimodalMessage(audioBlob);
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Error al acceder al micrófono:', err);
        alert('No se pudo acceder al micrófono.');
      }
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isRecording) return;
    if (!inputValue.trim() && !selectedImage) return;
    await sendMultimodalMessage();
  };

  const sendMultimodalMessage = async (audioBlob?: Blob) => {
    if (!selectedClient || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: audioBlob ? '🎤 Nota de voz enviada' : inputValue,
      timestamp: new Date(),
      imageUrl: imagePreviewUrl || undefined,
      audioUrl: audioBlob ? URL.createObjectURL(audioBlob) : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    const tempInput = inputValue;
    const tempImage = selectedImage;
    
    setInputValue('');
    setSelectedImage(null);
    setImagePreviewUrl(null);
    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('clientId', selectedClient);
      formData.append('message', tempInput || '');
      
      if (tempImage) {
        formData.append('image', tempImage);
      }
      if (audioBlob) {
        formData.append('audio', audioBlob, 'voice.webm');
      }

      const res = await fetch('/api/v1/admin/sandbox/chat', {
        method: 'POST',
        body: formData // No headers needed for fetch to auto-set multipart/form-data
      });

      const data = await res.json();

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || 'No hubo respuesta.',
        tools: data.tools || [],
        uiComponents: data.uiComponents || [],
        latency: data.latency_ms,
        timestamp: new Date(),
        steps: data.steps || [],
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Error de conexión con el Sandbox multimodelo.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className={styles.container}>
      {showVoiceMode && (
        <VoiceModeModal 
          onClose={() => setShowVoiceMode(false)} 
          onSendTranscript={async (text) => {
            setInputValue(text);
            // Simular un envío y capturar la respuesta
            return new Promise(async (resolve) => {
              try {
                const formData = new FormData();
                formData.append('clientId', selectedClient);
                formData.append('message', text);
                const res = await fetch('/api/v1/admin/sandbox/chat', { method: 'POST', body: formData });
                const data = await res.json();
                resolve(data.reply || 'No hubo respuesta');
              } catch (e) {
                resolve('Error de conexión');
              }
            });
          }} 
        />
      )}
      <header className={styles.header} style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Link href="/"
            style={{
              color: 'var(--text-muted)',
              marginBottom: '0.5rem',
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
            style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
          >
            <Terminal size={28} color="var(--primary)" /> Sandbox Multimodal
          </motion.h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem', margin: 0 }}>
            Prueba tus asistentes con texto, imágenes y notas de voz en vivo.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select
            value={selectedClient}
            onChange={(e) => {
              setSelectedClient(e.target.value);
              setMessages([]);
            }}
            style={{
              padding: '0.6rem 1rem',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--foreground)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-md)',
              outline: 'none',
              cursor: 'pointer',
              minWidth: '200px'
            }}
          >
            {clients.map(c => (
              <option key={c.id} value={c.id} style={{ background: '#111' }}>
                {c.name}
              </option>
            ))}
          </select>
          <button 
            onClick={clearChat}
            title="Reiniciar conversación"
            style={{
              padding: '0.5rem',
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <RefreshCw size={14} />
          </button>
          <button 
            onClick={() => setShowVoiceMode(true)}
            title="Advanced Voice Mode (Her)"
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              fontWeight: 600,
              boxShadow: 'var(--shadow-glow)'
            }}
          >
            <Headphones size={16} /> Voice Mode
          </button>
          <button 
            onClick={() => setShowMatrix(!showMatrix)}
            title="Matrix Mode"
            style={{
              padding: '0.5rem',
              background: showMatrix ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
              color: showMatrix ? 'var(--success)' : 'var(--text-muted)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <Eye size={14} />
          </button>
          <button 
            onClick={() => setShowMetadata(!showMetadata)}
            title="Estado del simulador"
            style={{
              padding: '0.5rem',
              background: showMetadata ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: showMetadata ? 'var(--foreground)' : 'var(--text-muted)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <Settings size={14} />
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '1.5rem', height: 'calc(100vh - 220px)', minHeight: '500px', justifyContent: 'center', position: 'relative' }}>
        {/* Chat Area - Vercel v0 / Claude Style (Centered) */}
        <Card style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, background: 'transparent', border: 'none', boxShadow: 'none' }}>
          <div style={{ 
            flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' 
          }}>
            {messages.length === 0 ? (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Terminal size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                <p>Escribe un mensaje, envía una foto o graba un audio para empezar.</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <motion.div 
                  key={msg.id}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  style={{ 
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '80%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: 'var(--text-muted)',
                    fontSize: '0.8rem',
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}>
                    {msg.role === 'user' ? <User size={14} /> : <Bot size={14} color="var(--primary)"/>}
                    {msg.role === 'user' ? 'Tú' : 'Agente'}
                  </div>
                  <div style={{ 
                    padding: '0.75rem 1rem', 
                    borderRadius: 'var(--radius-md)',
                    background: msg.role === 'user' ? 'var(--foreground)' : 'var(--surface-dark)',
                    color: msg.role === 'user' ? 'var(--background)' : 'var(--foreground)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--glass-border)',
                    fontSize: '0.9rem',
                    boxShadow: 'none',
                    backdropFilter: 'none',
                    borderBottomRightRadius: msg.role === 'user' ? '2px' : 'var(--radius-md)',
                    borderBottomLeftRadius: msg.role === 'user' ? 'var(--radius-md)' : '2px',
                    lineHeight: 1.6,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}>
                    {msg.imageUrl && (
                      <img src={msg.imageUrl} alt="User attachment" style={{ maxWidth: '100%', borderRadius: '8px', maxHeight: '200px', objectFit: 'cover' }} />
                    )}
                    {msg.audioUrl && (
                      <audio controls src={msg.audioUrl} style={{ maxWidth: '100%', height: '40px' }} />
                    )}
                    {msg.content}
                    {msg.uiComponents && msg.uiComponents.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                        {msg.uiComponents.map((ui, idx) => (
                          <DynamicWidget key={idx} ui={ui} />
                        ))}
                      </div>
                    )}
                    {showMatrix && msg.role === 'assistant' && msg.steps && msg.steps.length > 0 && (
                      <CognitiveStepsView steps={msg.steps} />
                    )}
                  </div>
                  {msg.tools && msg.tools.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                      {msg.tools.map((t, idx) => (
                        <span key={idx} style={{ 
                          fontSize: '0.75rem', padding: '0.2rem 0.6rem', 
                          background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)',
                          borderRadius: 'var(--radius-sm)', border: '1px solid rgba(16, 185, 129, 0.2)',
                          display: 'flex', alignItems: 'center', gap: '0.25rem'
                        }}>
                          <Wrench size={10} /> {t.tool}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))
            )}
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ alignSelf: 'flex-start', display: 'flex', gap: '0.75rem', alignItems: 'center', color: 'var(--text-muted)', width: '60%' }}
              >
                <Bot size={16} color="var(--primary)"/> 
                <div className="animate-shimmer" style={{ height: '24px', flex: 1, borderRadius: '12px' }}></div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input Area - Floating Pill */}
          <div style={{ padding: '1rem', background: 'transparent', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
            <AnimatePresence>
              {imagePreviewUrl && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} style={{ position: 'relative', width: 'fit-content', alignSelf: 'flex-start', marginLeft: '10%' }}>
                  <img src={imagePreviewUrl} alt="Preview" style={{ height: '60px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)' }} />
                  <button onClick={() => { setImagePreviewUrl(null); setSelectedImage(null); }} style={{ position: 'absolute', top: -5, right: -5, background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X size={12} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSendMessage} style={{ 
              display: 'flex', gap: '0.5rem', alignItems: 'center', 
              background: 'var(--surface-dark)', padding: '0.5rem 0.5rem 0.5rem 1rem',
              borderRadius: '2rem', border: '1px solid var(--glass-border)', 
              width: '100%', boxShadow: 'var(--shadow-glow)',
              transition: 'box-shadow 0.3s ease'
            }}>
              {/* Image Input Hidden */}
              <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} style={{ display: 'none' }} />
              
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isRecording}
                style={{ 
                  padding: '0.8rem', background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer',
                  transition: 'color 0.2s'
                }}
              >
                <ImageIcon size={20} />
              </button>

              {isRecording ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius-lg)', padding: '0.5rem' }}>
                  <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--danger)' }} />
                  </motion.div>
                  <span style={{ color: 'var(--danger)', fontWeight: 600, fontFamily: 'monospace', fontSize: '1.1rem' }}>
                    {formatTime(recordingTime)}
                  </span>
                </div>
              ) : (
                  <input 
                    type="text" 
                    placeholder="Escribe un mensaje al bot..."
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    disabled={isLoading}
                    style={{ 
                      flex: 1, padding: '0.5rem', 
                      background: 'transparent', color: 'var(--foreground)', 
                      border: 'none',
                      outline: 'none',
                      fontSize: '1rem'
                    }}
                  />
              )}

              <button 
                type="button"
                onClick={toggleRecording}
                disabled={isLoading}
                style={{ 
                  padding: '0.8rem', 
                  background: isRecording ? 'var(--danger)' : 'transparent', 
                  color: isRecording ? 'white' : 'var(--text-muted)', 
                  border: 'none', borderRadius: '50%', cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <Mic size={20} />
              </button>

              {!isRecording && (
                <button 
                  type="submit"
                  disabled={isLoading || (!inputValue.trim() && !selectedImage)}
                  style={{ 
                    padding: '0 1.25rem', height: '45px',
                    background: 'var(--primary)', color: '#fff', 
                    border: 'none', borderRadius: 'var(--radius-lg)',
                    cursor: (isLoading || (!inputValue.trim() && !selectedImage)) ? 'not-allowed' : 'pointer',
                    opacity: (isLoading || (!inputValue.trim() && !selectedImage)) ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginLeft: '0.25rem'
                  }}
                >
                  <Send size={18} />
                </button>
              )}
            </form>
          </div>
        </Card>

        {/* Metadata sidebar (Toggled) */}
        <AnimatePresence>
        {showMetadata && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0 }}
        >
        <Card style={{ width: '320px', height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem', background: 'var(--surface-card)', borderLeft: '1px solid var(--glass-border)', borderRadius: '0 var(--radius-xl) var(--radius-xl) 0' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Settings size={18} color="var(--primary)" /> Estado del Simulador
          </h3>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Latencia:</span>
                <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>
                  {messages.length > 0 ? (messages[messages.length - 1].latency || 0) + ' ms' : '--'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Sesión ID:</span>
                <span style={{ color: 'var(--foreground)', fontWeight: 500, fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                  sandbox-{selectedClient.slice(0,6)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Context Window:</span>
                <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>
                  {messages.length} msg
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Multimodal:</span>
                <div className="status-pulse" style={{ width: '6px', height: '6px', marginRight: '30px' }}>
                  <span style={{ background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }}></span>
                </div>
              </div>
            </div>

            <div style={{ paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--foreground)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Wrench size={14} color="var(--secondary)" /> Context Overrides
              </h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Simula variables dinámicas (JSON).</p>
              <textarea 
                value={overrideVars}
                onChange={e => setOverrideVars(e.target.value)}
                rows={4}
                style={{ 
                  width: '100%', padding: '0.75rem', 
                  background: 'rgba(0,0,0,0.3)', color: 'var(--foreground)',
                  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                  fontFamily: 'monospace', fontSize: '0.8rem', resize: 'none',
                  outline: 'none'
                }}
              />
            </div>
          </div>
        </Card>
        </motion.div>
        )}
        </AnimatePresence>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes jump {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
      `}} />
    </div>
  );
}
