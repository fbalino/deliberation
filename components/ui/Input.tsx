'use client';

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const inputStyle: React.CSSProperties = {
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
};

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: 'var(--danger)',
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', id, style, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`block w-full px-3 py-2 text-sm transition-colors duration-150 ${className}`}
          style={{ ...(error ? inputErrorStyle : inputStyle), ...style }}
          {...props}
        />
        {error && <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, style, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={`block w-full px-3 py-2 text-sm transition-colors duration-150 ${className}`}
          style={{ ...(error ? inputErrorStyle : inputStyle), ...style }}
          {...props}
        />
        {error && <p className="mt-1 text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export { Input, Textarea };
export type { InputProps, TextareaProps };
