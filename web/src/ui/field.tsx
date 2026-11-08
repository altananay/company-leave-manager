import { useId, type ComponentProps, type ReactNode, type Ref } from 'react'

import { cn } from '@/lib/utils'
import { Input } from '@/ui/input'
import { Label } from '@/ui/label'

/**
 * A labelled form field. Two ways to mark a failure:
 * - `error` renders the message under the field and wires `aria-describedby` to it;
 * - `invalid` only marks the field, for screens that show one shared message elsewhere (an Alert)
 *   and must not repeat the text twice.
 * Both set `aria-invalid`, so a screen reader announces the field as invalid (AC-3).
 */
function Field({
  label,
  error,
  invalid,
  describedBy,
  className,
  id,
  inputRef,
  ...props
}: ComponentProps<'input'> & {
  label: ReactNode
  error?: ReactNode
  invalid?: boolean
  describedBy?: string
  inputRef?: Ref<HTMLInputElement>
}) {
  const generated = useId()
  const inputId = id ?? generated
  const errorId = `${inputId}-error`
  const isInvalid = Boolean(error) || Boolean(invalid)
  const described = error ? errorId : describedBy

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        ref={inputRef}
        aria-invalid={isInvalid || undefined}
        aria-describedby={described}
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
