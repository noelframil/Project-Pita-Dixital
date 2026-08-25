import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface ButtonProps extends HTMLMotionProps<"button"> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  icon?: React.ReactNode;
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  children,
  icon,
  ...props
}: ButtonProps) => {
  let bg = 'transparent';
  let color = 'var(--foreground)';
  let border = 'none';
  let glow = 'none';

  if (variant === 'primary') {
    bg = 'linear-gradient(135deg, var(--primary), var(--primary-hover))';
    color = '#fff';
    glow = '0 0 15px rgba(139, 92, 246, 0.5)';
  } else if (variant === 'secondary') {
    bg = 'rgba(255, 255, 255, 0.1)';
    border = '1px solid rgba(255, 255, 255, 0.2)';
  } else if (variant === 'danger') {
    bg = 'rgba(244, 63, 94, 0.2)';
    color = '#f43f5e';
    border = '1px solid rgba(244, 63, 94, 0.3)';
  }

  const padding = size === 'sm' ? '0.4rem 0.8rem' : size === 'lg' ? '1rem 2rem' : '0.6rem 1.2rem';
  const fontSize = size === 'sm' ? '0.85rem' : size === 'lg' ? '1.1rem' : '0.95rem';

  return (
    <motion.button
      style={{
        background: bg,
        color,
        border,
        padding,
        fontSize,
        borderRadius: 'var(--radius-lg)',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        boxShadow: glow,
        cursor: 'pointer',
        outline: 'none',
        position: 'relative',
        overflow: 'hidden'
      }}
      whileHover={{ scale: 1.02, filter: 'brightness(1.1)' }}
      whileTap={{ scale: 0.98 }}
      {...props}
    >
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
      {children}
      {/* Subtle inner highlight */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)'
      }} />
    </motion.button>
  );
};
