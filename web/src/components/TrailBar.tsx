interface TrailBarProps {
	origin: string;
	steps: string[];
	onBack: () => void;
}

/** The path walked with More like this: where it started, each font stepped to, and a way back. */
export function TrailBar({ origin, steps, onBack }: TrailBarProps) {
	return (
		<nav aria-label="Your trail" className="flex min-h-[46px] items-center gap-3 border-b-[1.5px] border-ink py-2">
			<button
				type="button"
				onClick={onBack}
				className="flex h-8 shrink-0 cursor-pointer items-center rounded-[7px] border border-line bg-paper px-[10px] text-[13px] font-medium hover:border-ink"
			>
				← Back
			</button>
			<ol className="m-0 flex min-w-0 list-none items-center gap-2 overflow-hidden p-0 caption text-secondary">
				<li className="shrink-0">{origin}</li>
				{steps.map((step, index) => (
					<li key={`${step}-${index}`} className={`truncate ${index === steps.length - 1 ? 'text-accent' : ''}`}>
						<span aria-hidden="true">→ </span>
						{step}
					</li>
				))}
			</ol>
		</nav>
	);
}
