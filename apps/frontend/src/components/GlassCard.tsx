import React from 'react';

export const GlassCard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div
      style={{
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        padding: '2.5rem',
        width: '100%',
        maxWidth: '420px',
        color: '#ffffff',
      }}
    >
      {children}
    </div>
  );
};