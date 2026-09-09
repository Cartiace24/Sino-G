import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn('input', className)} {...props} />
  ),
);
Input.displayName = 'Input';

/**
 * Password field with its own show/hide toggle. This replaces the native
 * browser reveal control (Edge shows one only while hovering the field, so
 * it vanishes the moment the cursor leaves — the reported bug). The toggle
 * is part of the layout, so it never disappears.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const [shown, setShown] = React.useState(false);
    return (
      <span className="pw-wrap">
        <input
          ref={ref}
          className={cn('input', className)}
          {...props}
          type={shown ? 'text' : 'password'}
        />
        <button
          type="button"
          className="pw-toggle"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
          tabIndex={-1}
        >
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

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
