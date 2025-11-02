import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from './cn';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
	variant?: ButtonVariant;
	loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ className, variant = 'primary', loading = false, disabled, children, ...rest },
	ref
) {
	const isDisabled = disabled ?? loading;

	const variantClasses: Record<ButtonVariant, string> = {
		primary:
			'bg-brand text-brand-foreground shadow-sm hover:bg-brand/90 focus-visible:outline-brand data-[pressed]:bg-brand/90',
		secondary:
			'bg-slate-200 text-slate-900 hover:bg-slate-300 focus-visible:outline-slate-500 data-[pressed]:bg-slate-300',
		destructive:
			'bg-rose-600 text-white hover:bg-rose-500 focus-visible:outline-rose-500 data-[pressed]:bg-rose-500',
		ghost:
			'bg-transparent text-slate-900 hover:bg-slate-100 focus-visible:outline-slate-500 data-[pressed]:bg-slate-100',
	};

	return (
		<button
			ref={ref}
			className={cn(
				'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
				variantClasses[variant],
				className
			)}
			aria-busy={loading || undefined}
			disabled={isDisabled}
			{...rest}
		>
			{loading ? (
				<span className="inline-flex items-center gap-2">
					<span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-transparent" />
					<span>{children}</span>
				</span>
			) : (
				children
			)}
		</button>
	);
});
