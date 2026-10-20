import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'plain' | 'solid' }

/** Chalk-on-mat buttons: plain text for the toolbar, solid for the one thing to do next. */
export function Button({ tone = 'plain', className = '', ...rest }: Props) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-md text-[15px] leading-none whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk disabled:opacity-40 disabled:pointer-events-none'
  const tones = {
    plain: 'h-9 px-2 sm:px-3 text-chalk hover:bg-chalk/10 active:bg-chalk/15',
    solid: 'h-10 px-4 bg-chalk text-mat-deep font-medium hover:bg-white active:bg-chalk/90',
  }
  return <button type="button" className={`${base} ${tones[tone]} ${className}`} {...rest} />
}
