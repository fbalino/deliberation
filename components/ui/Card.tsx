import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: boolean;
}

export function Card({ padding = true, className = '', children, style, ...props }: CardProps) {
  return (
    <div
      className={`${padding ? 'p-6' : ''} ${className}`}
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-sm)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
