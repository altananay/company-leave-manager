import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/** Where the user is, as a real navigation landmark with an ordered list (AC-11). The label is a
 * required prop so no caller can fall back to a hard-coded English word. */
function Breadcrumb({
  className,
  label,
  ...props
}: Omit<ComponentProps<'nav'>, 'aria-label'> & { label: string }) {
  return <nav data-slot="breadcrumb" aria-label={label} className={cn(className)} {...props} />
}

function BreadcrumbList({ className, ...props }: ComponentProps<'ol'>) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn('flex flex-wrap items-center gap-1.5 text-small', className)}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn('inline-flex items-center gap-1.5', className)}
      {...props}
    />
  )
}

/** The page the user is on: text, not a link, and marked as the current page. */
function BreadcrumbPage({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn('font-medium text-foreground', className)}
      {...props}
    />
  )
}

function BreadcrumbSeparator({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn('text-muted-foreground', className)}
      {...props}
    >
      /
    </li>
  )
}

export { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator }
