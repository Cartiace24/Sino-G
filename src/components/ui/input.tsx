import * as React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('input', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'block',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '.14em',
        color: 'var(--muted)',
        marginBottom: 7,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </label>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="small" role="alert" style={{ color: 'var(--busy)', marginTop: 6, fontWeight: 600 }}>
      {message}
    </p>
  );
}
