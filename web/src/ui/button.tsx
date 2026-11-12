import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * The single button of the design system (spec 0003, AC-6). Every screen uses this component:
 * a second, hand-styled button is a defect. `min-h-11` keeps the 44 px touch target (AC-8).
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-body font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Every primary action carries the brand gradient (AC-15). The gradient is a token class so
        // no screen repeats it.
        default: 'brand-action bg-primary text-brand-foreground hover:brightness-105 shadow-1',
        secondary:
          'border border-control bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-1',
        outline:
          'border border-control bg-card text-foreground hover:bg-accent hover:text-accent-foreground',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-4 py-2',
        // Compact is narrower, never shorter: the 44 px touch target holds on every size (AC-8).
        sm: 'h-11 rounded-control px-3 text-small',
        lg: 'h-12 rounded-panel px-6 text-body',
        // An icon button is a square 44×44 target, and the floor is a minimum, not a hint: inside a
        // tight flex row (the header at 360 px) flexbox would otherwise shrink it below 44, which is
        // exactly what a wider Linux font did to the menu button (spec 0004, AC-10).
        icon: 'size-11 min-w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button }
