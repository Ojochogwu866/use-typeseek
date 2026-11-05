const LICENSE_OPTIONS = [
	{ value: '', label: 'Any licence' },
	{ value: 'commercial-ok', label: 'Commercial OK' },
];

interface LicenseFilterProps {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}

export function LicenseFilter({ value, onChange, disabled }: LicenseFilterProps) {
	return (
		<div className="inline-flex rounded-lg bg-ground p-[3px]" role="radiogroup" aria-label="Filter by licence">
			{LICENSE_OPTIONS.map((option) => {
				const isActive = value === option.value;
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						aria-checked={isActive}
						disabled={disabled}
						onClick={() => onChange(option.value)}
						className={`h-8 cursor-pointer rounded-md px-3 text-[14px] whitespace-nowrap transition-colors duration-[120ms] disabled:cursor-default disabled:opacity-40 ${
							isActive ? 'border border-ink bg-paper font-medium text-ink' : 'border border-transparent bg-transparent text-secondary hover:text-ink'
						}`}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
