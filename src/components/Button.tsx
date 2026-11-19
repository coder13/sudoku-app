import type { ComponentProps } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
type IconVariant = 'secondary' | 'quiet'
type NativeButton = ComponentProps<'button'>

/** Give a navigation link or file-picker label the same appearance as a text button. */
export function buttonClassName(variant: ButtonVariant = 'secondary', className?: string) {
  return ['button', variant, className].filter(Boolean).join(' ')
}

/** Use on an icon-only navigation link, with an accessible name describing its destination. */
export function iconButtonClassName(variant: IconVariant = 'secondary', className?: string) {
  return ['icon-button', variant === 'quiet' && 'borderless', className].filter(Boolean).join(' ')
}

/** Use for a labeled action. Primary advances the task, secondary supports it,
 * quiet has low emphasis, and danger confirms a destructive action. */
export function Button({ variant = 'secondary', className, type = 'button', ...props }:
  NativeButton & { variant?: ButtonVariant }) {
  return <button {...props} type={type} className={buttonClassName(variant, className)} />
}

/** Use for a familiar icon in a toolbar or compact row. Name the action for assistive technology. */
export function IconButton({ variant = 'secondary', className, type = 'button', ...props }:
  NativeButton & { variant?: IconVariant; 'aria-label': string }) {
  return <button {...props} type={type} className={iconButtonClassName(variant, className)} />
}

/** Use for a choice that needs a title and room for a supporting description. */
export function ChoiceButton({ className, type = 'button', ...props }: NativeButton) {
  return <button {...props} type={type} className={buttonClassName('secondary', ['choice-button', className].filter(Boolean).join(' '))} />
}
