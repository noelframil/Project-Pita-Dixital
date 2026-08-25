import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface CardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

export const Card = ({ children, className = '', hoverEffect = false, ...props }: CardProps) => {
  return (
    <motion.div
      className={`
        relative overflow-hidden rounded-[var(--radius-lg)]
        bg-[var(--surface-light)] border border-[rgba(255,255,255,0.08)]
        shadow-[var(--shadow-card)] backdrop-blur-md
        ${className}
      `}
      style={{
        background: 'var(--surface-light)',
        border: '1px solid var(--glass-border)',
        boxShadow: 'var(--shadow-card)',
        borderRadius: 'var(--radius-lg)'
      }}
      whileHover={hoverEffect ? { 
        y: -4, 
        boxShadow: '0 15px 35px rgba(0,0,0,0.4), 0 0 20px rgba(139, 92, 246, 0.2)',
        borderColor: 'rgba(139, 92, 246, 0.4)'
      } : {}}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      {...props}
    >
      {/* Inner Glow Effect */}
      {hoverEffect && (
        <motion.div 
          className="absolute inset-0 pointer-events-none"
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          style={{ 
            boxShadow: 'inset 0 0 20px rgba(139, 92, 246, 0.1)',
            borderRadius: 'var(--radius-lg)'
          }}
        />
      )}
      {children}
    </motion.div>
  );
};
