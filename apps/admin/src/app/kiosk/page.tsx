"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Loader2, ScanFace, CheckCircle2 } from 'lucide-react';

export default function KioskPage() {
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [botResponse, setBotResponse] = useState('Bienvenido a Pita-Dixital. ¿En qué puedo ayudarte?');
  const [isScanning, setIsScanning] = useState(false);
  const [checkinComplete, setCheckinComplete] = useState(false);
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Initialize SpeechRecognition si está en el browser
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'es-ES';

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) handleFinalTranscript(finalTranscript);
      };

      recognition.onend = () => {
        if (!isThinking && recognitionRef.current) {
          try { recognition.start(); } catch (e) {}
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const handleFinalTranscript = async (text: string) => {
    if (!text.trim()) return;
    setIsListening(false);
    setIsThinking(true);
    if (recognitionRef.current) recognitionRef.current.stop();

    try {
      const lower = text.toLowerCase();
      if (lower.includes('check') || lower.includes('entrar') || lower.includes('llegado')) {
        setBotResponse('Por favor, acerca tu pasaporte o DNI al escáner inferior.');
        setIsScanning(true);
        setTimeout(() => {
            setIsScanning(false);
            setCheckinComplete(true);
            setBotResponse('Check-in completado, Sr. García. Su llave digital ha sido enviada a su teléfono vía Bluetooth. Disfrute de la Habitación 204.');
        }, 4000);
      } else {
        setBotResponse('Entendido. Un momento por favor...');
        setTimeout(() => setBotResponse('¿Hay algo más en lo que pueda ayudarte?'), 2000);
      }
    } finally {
      setIsThinking(false);
      setIsListening(true);
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (e) {}
      }
    }
  };

  return (
    <div style={{ 
        width: '100vw', height: '100vh', background: '#000', color: '#fff', 
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
        overflow: 'hidden', position: 'relative'
    }}>
      {/* Orbe Holográfico Central */}
      <div style={{ position: 'relative', width: '300px', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '4rem' }}>
        <motion.div
          animate={{
            scale: isThinking ? [1, 1.3, 1] : isListening ? [1, 1.05, 1] : 1,
            opacity: isThinking ? [0.6, 1, 0.6] : 0.8,
          }}
          transition={{
            duration: isThinking ? 1.5 : 3,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{
            position: 'absolute',
            width: '100%', height: '100%',
            borderRadius: '50%',
            background: isThinking ? 'var(--primary)' : checkinComplete ? 'var(--success)' : 'rgba(255,255,255,0.2)',
            filter: 'blur(50px)',
            opacity: 0.5
          }}
        />
        <div style={{
          width: '150px', height: '150px', borderRadius: '50%',
          background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10
        }}>
          {isThinking ? <Loader2 size={50} className="animate-spin" color="var(--primary)"/> 
            : checkinComplete ? <CheckCircle2 size={50} color="var(--success)"/>
            : isListening ? <Mic size={50} color="#fff"/> 
            : <MicOff size={50} color="var(--text-muted)"/>}
        </div>
      </div>

      {/* Respuesta del Avatar */}
      <div style={{ textAlign: 'center', maxWidth: '800px', padding: '0 2rem', zIndex: 10 }}>
        <motion.h1 
          key={botResponse}
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: '2.5rem', fontWeight: 300, lineHeight: 1.4, margin: 0 }}
        >
          {botResponse}
        </motion.h1>
      </div>

      {/* Zona de Escáner Multimodal */}
      {isScanning && (
        <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ 
                position: 'absolute', bottom: '4rem', width: '400px', height: '250px', 
                border: '2px dashed var(--primary)', borderRadius: '24px', 
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(139, 92, 246, 0.05)', backdropFilter: 'blur(10px)'
            }}
        >
            <ScanFace size={48} color="var(--primary)" style={{ marginBottom: '1rem' }} />
            <p style={{ fontSize: '1.2rem', margin: 0 }}>Acerca tu Pasaporte o DNI</p>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'var(--primary)', boxShadow: '0 0 20px var(--primary)', animation: 'scan 2s infinite linear' }} />
            <style>{`@keyframes scan { 0% { top: 0%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }`}</style>
        </motion.div>
      )}
    </div>
  );
}
