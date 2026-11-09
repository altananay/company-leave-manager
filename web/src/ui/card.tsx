import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'rounded-card border border-border bg-card text-card-foreground shadow-1',
        'flex flex-col gap-5 p-6 sm:p-7',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-header" className={cn('flex flex-col gap-1', className)} {...props} />
}

function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 data-slot="card-title" className={cn('text-h2 leading-tight', className)} {...props} />
}

function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      data-slot="card-description"
      className={cn('text-body text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div data-slot="card-content" className={cn('flex flex-col gap-4', className)} {...props} />
  )
}

export { Card, CardContent, CardDescription, CardHeader, CardTitle }
