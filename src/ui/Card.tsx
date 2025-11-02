import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {}

export function Card({ className, ...rest }: CardProps) {
	return (
		<div
			className={cn(
				'rounded-2xl border border-slate-200 bg-white p-6 shadow-card/40 shadow-lg',
				className
			)}
			{...rest}
		/>
	);
}
