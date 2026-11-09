import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/** The single text input of the design system (spec 0003, AC-6). */
function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // The 16 px mobile control size is deliberate: iOS zooms a focused field below 16 px, and
        // the scale's body step is 15 px. From md the field takes the scale step.
        'flex h-11 w-full rounded-control border border-control bg-card px-3 py-2 text-base shadow-1 transition-colors md:text-body', // tokens-allow: iOS zoom guard (16 px on mobile)
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
