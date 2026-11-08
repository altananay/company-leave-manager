import { useId, type ComponentProps, type ReactNode, type Ref } from 'react'

import { cn } from '@/lib/utils'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'

/**
 * A labelled form field: the label, the input, and the error message wired together with
 * `aria-describedby` / `aria-invalid` so a screen reader announces the failure (AC-3).
 */
function Field({
  label,
  error,
  className,
  id,
  inputRef,
  ...props
}: ComponentProps<'input'> & {
  label: ReactNode
  error?: ReactNode
  inputRef?: Ref<HTMLInputElement>
}) {
  const generated = useId()
  const inputId = id ?? generated
  const errorId = `${inputId}-error`

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        ref={inputRef}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(className)}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export { Field }
