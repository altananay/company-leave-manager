import 'vitest'

/** jest-axe's matcher, registered in `setup.ts`; this is its type for Vitest. */
declare module 'vitest' {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T
  }
}
