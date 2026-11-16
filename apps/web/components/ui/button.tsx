import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export const buttonVariants = cva(
  'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-center text-sm font-semibold whitespace-nowrap no-underline transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground',
        outline: 'border border-input bg-card text-foreground hover:bg-muted hover:text-foreground',
        ghost: 'px-3 font-medium text-soft hover:bg-muted hover:text-foreground',
      },
      size: {
        default: '',
        sm: 'h-8 rounded-[7px] px-2.5 text-xs font-medium',
        icon: 'size-10 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({ className, variant, size, ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Logo({ className }: { className?: string }) {
  return <span className={cn('grid size-7 shrink-0 place-items-center rounded-[7px] bg-primary text-primary-foreground', className)} aria-hidden>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6" /><path d="M10 3v6L5 18a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3L14 9V3" /><path d="M7.5 14h9" />
    </svg>
  </span>;
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const letters = name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2) || '?';
  return <span className={cn('grid shrink-0 place-items-center bg-muted font-bold text-foreground', className)} aria-hidden>
    {letters.toLocaleUpperCase('pt-BR')}
  </span>;
}
