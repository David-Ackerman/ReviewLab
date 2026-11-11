import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        outline: 'border border-input bg-card hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
      },
      size: {
        default: 'min-h-10',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({ className, variant, size, ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
