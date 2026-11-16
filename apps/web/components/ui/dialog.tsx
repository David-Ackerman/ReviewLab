'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
import { buttonVariants } from './button';

export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export const DialogClose = DialogPrimitive.Close;

/** Painel lateral à direita: o formulário fica ao lado do contexto em vez de cobri-lo. */
export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#0f1115]/45 backdrop-blur-[1px]" />
    <DialogPrimitive.Content
      data-slot="dialog-content"
      className={cn('fixed inset-y-0 right-0 z-50 flex w-full max-w-160 flex-col bg-card shadow-[-12px_0_40px_rgba(15,17,21,.18)] outline-none sm:border-l sm:border-border', className)}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'absolute top-5 right-5 text-soft sm:right-7')} aria-label="Fechar">
        <X size={18} aria-hidden />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>;
}
