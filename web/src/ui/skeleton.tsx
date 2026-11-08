import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/** A placeholder that keeps the layout still while data loads (AC-14). */
function Skeleton({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('block animate-pulse rounded-control bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
