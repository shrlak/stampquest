import { motion, type HTMLMotionProps } from 'framer-motion';

type Variant = 'primary' | 'outline' | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-ink text-paper-light disabled:bg-ink/30',
  outline: 'border border-ink/30 text-ink active:bg-ink/5 disabled:text-ink/30 disabled:border-ink/15',
  danger: 'border border-terracotta/40 text-terracotta active:bg-terracotta/10',
};

export function Button({
  variant = 'primary',
  className = '',
  disabled,
  ...props
}: HTMLMotionProps<'button'> & { variant?: Variant }) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.96 }}
      whileHover={disabled ? undefined : { y: -1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      disabled={disabled}
      className={`min-h-11 rounded-xl px-5 font-display text-base tracking-wide transition-colors ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
