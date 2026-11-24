import type { ComponentProps } from 'react'

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary'
}

export function Button({ variant = 'primary', type = 'button', className, ...rest }: ButtonProps) {
  return <button {...rest} type={type} data-variant={variant} className={['btn', className].filter(Boolean).join(' ')} />
}
