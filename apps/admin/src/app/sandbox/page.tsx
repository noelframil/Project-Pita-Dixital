"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Terminal, Settings, Wrench, RefreshCw, User, Bot, Mic, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
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
  latency?: number;
  timestamp: Date;
  imageUrl?: string;
  audioUrl?: string;
};

export default function SandboxPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
        latency: data.latency_ms,
        timestamp: new Date(),
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
              padding: '0.6rem',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text-muted)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '1.5rem', height: 'calc(100vh - 220px)', minHeight: '500px' }}>
        {/* Chat Area */}
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
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
                    padding: '1rem 1.25rem', 
                    borderRadius: '1.25rem',
                    background: msg.role === 'user' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                    color: msg.role === 'user' ? '#fff' : 'var(--foreground)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--glass-border)',
                    borderBottomRightRadius: msg.role === 'user' ? '4px' : '1.25rem',
                    borderBottomLeftRadius: msg.role === 'user' ? '1.25rem' : '4px',
                    lineHeight: 1.5,
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ alignSelf: 'flex-start', display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--text-muted)' }}
              >
                <Bot size={16} color="var(--primary)"/> 
                <span className={styles.typingDot}>.</span><span className={styles.typingDot} style={{ animationDelay: '0.2s' }}>.</span><span className={styles.typingDot} style={{ animationDelay: '0.4s' }}>.</span>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* Input Area */}
          <div style={{ padding: '1rem', borderTop: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <AnimatePresence>
              {imagePreviewUrl && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} style={{ position: 'relative', width: 'fit-content' }}>
                  <img src={imagePreviewUrl} alt="Preview" style={{ height: '60px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)' }} />
                  <button onClick={() => { setImagePreviewUrl(null); setSelectedImage(null); }} style={{ position: 'absolute', top: -5, right: -5, background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X size={12} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
                    flex: 1, padding: '0.8rem 1rem', 
                    background: 'rgba(255,255,255,0.05)', color: 'var(--foreground)', 
                    border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)',
                    outline: 'none'
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

        {/* Metadata sidebar */}
        <Card style={{ width: '300px', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <Settings size={16} /> Estado del Simulador
          </h3>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Estás simulando una conversación como si fueras un usuario escribiendo desde la web o WhatsApp.
            </p>
            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Latencia:</span>
                <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>
                  {messages.length > 0 ? (messages[messages.length - 1].latency || 0) + ' ms' : '--'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Sesión ID:</span>
                <span style={{ color: 'var(--foreground)', fontWeight: 500, fontFamily: 'monospace' }}>
                  sandbox-{selectedClient.slice(0,6)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Context Window:</span>
                <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>
                  {messages.length} msg
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Multimodal:</span>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>ACTIVO</span>
              </div>
            </div>
          </div>
        </Card>
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
