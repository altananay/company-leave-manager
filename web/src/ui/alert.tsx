import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Inline message: errors and notices use the same component so the two never drift apart (AC-6).
 * `role="alert"` on the destructive variant is what a screen reader announces (AC-3).
 */
const alertVariants = cva('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', {
  variants: {
    variant: {
      info: 'border-border bg-muted text-foreground',
      success: 'border-success/30 bg-success/10 text-foreground',
      destructive: 'border-destructive/30 bg-destructive/10 text-foreground',
    },
  },
  defaultVariants: { variant: 'info' },
})

function Alert({
  className,
  variant,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Alert }
