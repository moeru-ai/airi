/** Available button sizes shared by the button primitives. */
export type ButtonSize = 'sm' | 'md' | 'lg' | 'unset'

/** Geometry used by solid buttons. */
export type ButtonShape = 'rect' | 'rounded' | 'circle' | 'parallelogram'

/** Supported button color families backed by the Wind3 palette. */
export type ButtonColor = 'neutral' | 'primary' | 'cyan' | 'blue' | 'green' | 'lime' | 'amber' | 'red' | 'orange' | 'purple' | 'pink'

/** Visual emphasis within a button color family. */
export type ButtonVariant = 'primary' | 'secondary'

/** Shared interaction and content props implemented by {@link BasicButton}. */
export interface BasicButtonProps {
  /** UnoCSS/Iconify class rendered before the label or default slot. */
  icon?: string
  /** Text content used instead of the default slot. */
  label?: string
  /** Prevents interaction. */
  disabled?: boolean
  /** Replaces the icon with a spinner and prevents interaction. */
  loading?: boolean
  /** Controls padding and type scale. @default 'md' */
  size?: ButtonSize
  /** Expands the button to the width of its container. @default false */
  block?: boolean
}

/** Visual props for the solid button. */
export interface ButtonProps extends BasicButtonProps {
  /** Controls the button geometry. @default 'rect' */
  shape?: ButtonShape
  /** Selects the button color family. @default 'neutral' */
  color?: ButtonColor
  /** Selects solid or subtle emphasis within the color family. @default 'secondary' */
  variant?: ButtonVariant
  /** Shows the offset outline on hover and keyboard focus. @default true */
  outline?: boolean
}
