import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close

/**
 * A panel that slides in from the side. Built on the dialog primitive on purpose: focus is trapped,
 * Escape closes it and focus returns to the trigger (AC-11).
 */
function SheetContent({
  className,
  children,
  closeLabel,
  side = 'left',
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  closeLabel: string
  side?: 'left' | 'right'
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-[1px] transition-opacity duration-(--duration-base)"
      />
      <DialogPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'fixed inset-y-0 z-50 flex w-[min(20rem,calc(100%-3rem))] flex-col gap-4 border-border bg-card p-4 text-card-foreground shadow-3 transition-transform duration-(--duration-base)',
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={closeLabel}
            className="absolute right-2 top-2 text-muted-foreground"
          >
            <X aria-hidden="true" />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-h2 font-semibold leading-tight', className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-small text-muted-foreground', className)}
      {...props}
    />
  )
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger }
