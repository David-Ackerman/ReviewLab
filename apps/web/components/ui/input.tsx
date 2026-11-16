import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

const fieldStyles = 'w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm font-normal text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary-muted disabled:opacity-50';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(fieldStyles, 'h-10 file:mr-3 file:rounded-md file:bg-muted file:px-2 file:py-0.5 file:font-semibold file:text-foreground', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(fieldStyles, 'min-h-20 resize-y py-2.5 leading-relaxed', className)} {...props} />;
}
