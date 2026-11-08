import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * The semantic type scale (`text-body`, `text-small`, …) is defined in `index.css`, not in
 * tailwind-merge's defaults, which read every unknown `text-*` as a colour. Registering the scale
 * keeps a size and a colour side by side: a primary button with `size="sm"`/`size="lg"` used to
 * lose `text-primary-foreground` to `text-small`/`text-body` and inherited the dark page colour on
 * the gradient.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'h1', 'h2', 'body', 'small', 'label'] }],
    },
  },
})

/** Merges conditional classes and lets a later utility override an earlier one (shadcn/ui convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
