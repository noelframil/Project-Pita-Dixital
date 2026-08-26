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
  Inbox,
  Terminal,
  Blocks
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
  { name: 'Sandbox', path: '/sandbox', icon: Terminal },
];

export default function Sidebar() {
  const pathname = usePathname() || '';
  
  return (
    <aside style={{
      width: '240px',
      background: 'transparent',
      borderRight: '1px solid var(--glass-border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '1.5rem 1rem',
      position: 'relative',
      zIndex: 'var(--z-base)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0 0.5rem',
        marginBottom: '2rem',
        fontSize: '0.9rem',
        fontWeight: 600,
        color: 'var(--foreground)',
        letterSpacing: '-0.02em'
      }}>
        <motion.div 
          whileHover={{ rotate: 180 }}
          transition={{ duration: 0.3 }}
          style={{
            background: '#ffffff',
            borderRadius: '6px',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Bot size={14} color="#000" />
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
                    whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                    whileTap={{ scale: 0.99 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.4rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      color: isActive ? 'var(--foreground)' : 'var(--text-muted)',
                      background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                      fontWeight: isActive ? 500 : 400,
                      fontSize: '0.85rem',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Icon size={14} color={isActive ? 'var(--foreground)' : 'currentColor'} />
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
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  fontWeight: 400,
                  fontSize: '0.85rem',
                }}
              >
                <Settings size={14} />
                Settings
              </motion.div>
            </Link>
          </li>
        </ul>
      </div>
    </aside>
  );
}
