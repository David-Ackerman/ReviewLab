'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return <CheckboxPrimitive.Root
    data-slot="checkbox"
    className={cn('mt-0.5 size-5 shrink-0 rounded-[5px] border border-input bg-card shadow-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground', className)}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="grid place-items-center">
      <Check size={15} aria-hidden />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>;
}
