import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

const fieldStyles = 'w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-sm font-normal shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" className={cn(fieldStyles, 'min-h-10 file:mr-3 file:rounded-md file:bg-muted file:px-2 file:py-0.5 file:font-semibold file:text-foreground', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(fieldStyles, 'min-h-20 resize-y', className)} {...props} />;
}

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return <select data-slot="native-select" className={cn(fieldStyles, 'min-h-10', className)} {...props} />;
}
