interface LogoProps {
	hasName?: boolean;
	size?: number;
}

/** Two dots: the font you found and its nearest neighbour. The name sits beside it on public pages. */
export function Logo({ hasName = true, size = 17 }: LogoProps) {
	return (
		<span className="inline-flex items-center gap-[7px]">
			<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="shrink-0">
				<circle cx="10" cy="13.5" r="7" fill="#3B4740" />
				<circle cx="20" cy="4.5" r="2.8" fill="#7E8883" />
			</svg>
			{hasName ? (
				<span className="text-[19px] leading-none font-semibold tracking-[-0.025em] text-ink">typeseek</span>
			) : (
				<span className="sr-only">typeseek</span>
			)}
		</span>
	);
}
