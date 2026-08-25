"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Bot,
  Brain,
  Activity,
  Zap,
  MessageSquare,
  Settings,
  Inbox
} from 'lucide-react';

const navItems = [
  { name: 'Command Center', path: '/', icon: LayoutDashboard },
  { name: 'Aprobaciones', path: '/pending', icon: CheckSquare },
  { name: 'Agentes & Autoconfig', path: '/clients', icon: Users },
  { name: 'Subagentes Expertos', path: '/subagents', icon: Bot },
  { name: 'Memoria Semántica', path: '/memory', icon: Brain },
  { name: 'Observabilidad', path: '/llmops', icon: Activity },
  { name: 'Integraciones & Tools', path: '/integrations', icon: Zap },
  { name: 'Canales', path: '/channels', icon: MessageSquare },
  { name: 'Bandeja Handoff', path: '/inbox', icon: Inbox },
];

export default function Sidebar() {
  const pathname = usePathname() || '';
  
  return (
    <aside style={{
      width: '280px',
      background: 'rgba(10, 10, 15, 0.4)',
      borderRight: '1px solid var(--glass-border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '2rem 1rem',
      position: 'relative',
      zIndex: 'var(--z-base)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0 1rem',
        marginBottom: '2.5rem',
        fontSize: '1.2rem',
        fontWeight: 700,
        color: 'var(--foreground)'
      }}>
        <motion.div 
          whileHover={{ rotate: 180 }}
          transition={{ duration: 0.3 }}
          style={{
            background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
            borderRadius: '12px',
            padding: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(139,92,246,0.4)'
          }}
        >
          <Bot size={20} color="white" />
        </motion.div>
        <span>Pita Dixital</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {navItems.map((item) => {
            const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <Link href={item.path}>
                  <motion.div
                    whileHover={{ x: 4, backgroundColor: 'rgba(255,255,255,0.05)' }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      color: isActive ? 'var(--foreground)' : 'var(--text-muted)',
                      background: isActive ? 'linear-gradient(90deg, rgba(139,92,246,0.15), transparent)' : 'transparent',
                      borderLeft: isActive ? '3px solid var(--primary)' : '3px solid transparent',
                      fontWeight: isActive ? 600 : 500,
                      transition: 'color 0.2s ease'
                    }}
                  >
                    <Icon size={18} color={isActive ? 'var(--primary)' : 'currentColor'} />
                    {item.name}
                  </motion.div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
        <ul>
          <li>
            <Link href="/settings">
              <motion.div
                whileHover={{ x: 4, backgroundColor: 'rgba(255,255,255,0.05)' }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-muted)',
                  fontWeight: 500
                }}
              >
                <Settings size={18} />
                Settings
              </motion.div>
            </Link>
          </li>
        </ul>
      </div>
    </aside>
  );
}
