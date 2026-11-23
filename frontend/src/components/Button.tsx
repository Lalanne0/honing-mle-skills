import type { ButtonHTMLAttributes } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
}

export function Button({ variant = 'primary', type = 'button', className, ...rest }: ButtonProps) {
  return <button {...rest} type={type} data-variant={variant} className={['btn', className].filter(Boolean).join(' ')} />
}
