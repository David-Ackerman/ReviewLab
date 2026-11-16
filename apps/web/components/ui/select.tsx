'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useContext, type ComponentProps } from 'react';
import { cn } from '../../lib/utils';
import { StyleNonceContext } from '../theme';

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return <SelectPrimitive.Trigger data-slot="select-trigger" className={cn(
    'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted data-[state=open]:border-primary disabled:opacity-50 [&>span]:truncate',
    className,
  )} {...props}>
    {children}
    <SelectPrimitive.Icon asChild><ChevronDown size={16} className="shrink-0 text-muted-foreground" aria-hidden /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>;
}

export function SelectContent({ children, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  const nonce = useContext(StyleNonceContext);
  return <SelectPrimitive.Portal>
    <SelectPrimitive.Content data-slot="select-content" position="popper" align="start" sideOffset={5}
      className="z-[60] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border border-border bg-card text-foreground shadow-lg"
      {...props}>
      <SelectPrimitive.ScrollUpButton className="grid h-6 place-items-center"><ChevronUp size={15} aria-hidden /></SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport nonce={nonce} className="p-1">{children}</SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="grid h-6 place-items-center"><ChevronDown size={15} aria-hidden /></SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>;
}

export function SelectItem({ children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item data-slot="select-item"
    className="relative flex min-h-9 cursor-default select-none items-center rounded-md py-1.5 pr-8 pl-2.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted data-[state=checked]:text-primary"
    {...props}>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="absolute right-2.5"><Check size={15} aria-hidden /></SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>;
}
