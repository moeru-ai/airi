/** Shared interaction and content props implemented by {@link BasicButton}. */
export interface BasicButtonProps {
  /** Expands the button to the width of its container. @default false */
  block?: boolean
  /** Prevents interaction. */
  disabled?: boolean
  /** UnoCSS/Iconify class rendered before the label or default slot. */
  icon?: string
  /** Text content used instead of the default slot. */
  label?: string
  /** Replaces the icon with a spinner and prevents interaction. */
  loading?: boolean
  /** Controls padding and type scale. @default 'md' */
  size?: ButtonSize
}

/** Supported button color families backed by the Wind3 palette. */
export type ButtonColor = 'amber' | 'blue' | 'cyan' | 'green' | 'lime' | 'neutral' | 'orange' | 'pink' | 'primary' | 'purple' | 'red'

/** Visual props for the solid button. */
export interface ButtonProps extends BasicButtonProps {
  /** Selects the button color family. @default 'neutral' */
  color?: ButtonColor
  /** Shows the offset outline on hover and keyboard focus. @default true */
  outline?: boolean
  /** Controls the button geometry. @default 'rect' */
  shape?: ButtonShape
  /** Selects solid or subtle emphasis within the color family. @default 'secondary' */
  variant?: ButtonVariant
}

/** Geometry used by solid buttons. */
export type ButtonShape = 'circle' | 'parallelogram' | 'rect' | 'rounded'

/** Available button sizes shared by the button primitives. */
export type ButtonSize = 'lg' | 'md' | 'sm' | 'unset'

/** Visual emphasis within a button color family. */
export type ButtonVariant = 'primary' | 'secondary'
