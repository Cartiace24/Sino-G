import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * shadcn-style button mapped onto the approved Sino G visual system.
 * Variants use the existing .btn classes — no redesign.
 */
const buttonVariants = cva('btn', {
  variants: {
    variant: {
      dark: 'btn-dark',
      green: 'btn-green',
      line: 'btn-line',
      paper: 'btn-paper',
    },
    size: {
      default: '',
      sm: 'btn-sm',
      big: 'btn-big',
      block: 'btn-block',
      smBlock: 'btn-sm btn-block',
      bigBlock: 'btn-big btn-block',
    },
  },
  defaultVariants: { variant: 'dark', size: 'default' },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
