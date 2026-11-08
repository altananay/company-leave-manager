import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/** "Ayşe Yılmaz" → "AY", "hr admin" → "HA"; Turkish casing so "i" becomes "İ". */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toLocaleUpperCase('tr')
}

/**
 * A person, as two letters. Decorative by default: the name is always next to it in the table, so
 * reading the initials again would only add noise for a screen reader.
 */
function Avatar({ name, className, ...props }: ComponentProps<'span'> & { name: string }) {
  return (
    <span
      data-slot="avatar"
      aria-hidden="true"
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-pill bg-accent text-small font-semibold text-accent-foreground',
        className,
      )}
      {...props}
    >
      {initials(name)}
    </span>
  )
}

export { Avatar, initials }
