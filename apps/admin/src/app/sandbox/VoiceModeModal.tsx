import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Mic, MicOff, Loader2 } from 'lucide-react';

interface VoiceModeModalProps {
  onClose: () => void;
  onSendTranscript: (text: string) => Promise<string>;
}

export default function VoiceModeModal({ onClose, onSendTranscript }: VoiceModeModalProps) {
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [botResponse, setBotResponse] = useState('Hola. Estoy escuchando.');
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Initialize SpeechRecognition if available
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'es-ES';

      recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        setTranscript(finalTranscript || interimTranscript);
        
        if (finalTranscript) {
          handleFinalTranscript(finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        // Auto-restart if we didn't manually stop it and it's not thinking
        if (!isThinking && recognitionRef.current) {
          try { recognition.start(); } catch (e) {}
        }
      };

      recognitionRef.current = recognition;
      // Auto-start
      recognition.start();
      setIsListening(true);
    } else {
      setBotResponse('El reconocimiento de voz no está soportado en este navegador.');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const handleFinalTranscript = async (text: string) => {
    if (!text.trim()) return;
    setIsListening(false);
    setIsThinking(true);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    try {
      const reply = await onSendTranscript(text);
      setBotResponse(reply);
    } catch (err) {
      setBotResponse('Hubo un error al procesar tu voz.');
    } finally {
      setIsThinking(false);
      setIsListening(true);
      setTranscript('');
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (e) {}
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(20px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <button 
        onClick={onClose}
        style={{
          position: 'absolute', top: '2rem', right: '2rem',
          background: 'rgba(255,255,255,0.1)', border: 'none',
          color: 'white', padding: '0.75rem', borderRadius: '50%',
          cursor: 'pointer'
        }}
      >
        <X size={24} />
      </button>

      <div style={{ position: 'relative', width: '200px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {/* Orb animation */}
        <motion.div
          animate={{
            scale: isThinking ? [1, 1.2, 1] : isListening ? [1, 1.05, 1] : 1,
            opacity: isThinking ? [0.5, 1, 0.5] : 0.8,
          }}
          transition={{
            duration: isThinking ? 1 : 2,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{
            position: 'absolute',
            width: '100%', height: '100%',
            borderRadius: '50%',
            background: isThinking ? 'var(--primary)' : isListening ? 'var(--success)' : 'var(--text-muted)',
            filter: 'blur(30px)',
            opacity: 0.5
          }}
        />
        <div style={{
          width: '120px', height: '120px', borderRadius: '50%',
          background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10
        }}>
          {isThinking ? <Loader2 size={40} className="animate-spin" color="var(--primary)"/> : isListening ? <Mic size={40} color="var(--success)"/> : <MicOff size={40} color="var(--text-muted)"/>}
        </div>
      </div>

      <div style={{ marginTop: '3rem', textAlign: 'center', maxWidth: '600px' }}>
        <motion.p 
          key={botResponse}
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          style={{ fontSize: '1.5rem', color: 'white', fontWeight: 300, lineHeight: 1.5 }}
        >
          {botResponse}
        </motion.p>
        {transcript && (
          <p style={{ color: 'var(--text-muted)', marginTop: '2rem', fontSize: '1.1rem', fontStyle: 'italic' }}>
            "{transcript}"
          </p>
        )}
      </div>
    </motion.div>
  );
}
