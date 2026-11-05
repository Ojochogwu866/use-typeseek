import { useRef, useState } from 'react';
import type { FontResult } from '../api/types';
import { useFontStatus } from '../hooks/useFontStatus';
import { useIsNearView } from '../hooks/useIsNearView';
import { licenceLabel } from '../lib/licence';

interface SpecimenStripProps {
	font: FontResult;
	rank: number;
	previewWords: string;
	isSelected: boolean;
	onOpen: (id: number) => void;
	onMoreLikeThis: (font: FontResult) => void;
}

/** One result: your words set in the font, large, with a small caption underneath. */
export function SpecimenStrip({ font, rank, previewWords, isSelected, onOpen, onMoreLikeThis }: SpecimenStripProps) {
	const [retryCount, setRetryCount] = useState(0);
	const stripRef = useRef<HTMLLIElement>(null);
	// Fonts load only for strips on or near the screen.
	const isNearView = useIsNearView(stripRef);
	const status = useFontStatus(font.name, isNearView, retryCount);
	const rankLabel = String(rank).padStart(2, '0');

	return (
		<li
			ref={stripRef}
			className={`group relative border-b border-rule transition-colors duration-[120ms] hover:bg-tint ${
				isSelected ? 'border-l-[3px] border-l-accent' : ''
			}`}
		>
			<button
				type="button"
				onClick={() => onOpen(font.id)}
				aria-current={isSelected ? 'true' : undefined}
				aria-label={`${font.name}, result ${rank}. Open details.`}
				className="block w-full cursor-pointer border-0 bg-transparent px-[18px] pt-[18px] pb-[70px] text-left sm:pb-[44px]"
			>
				<span className="block h-[46px] overflow-hidden sm:h-[68px]">
					{status === 'ready' && (
						<span
							className="block animate-fade-in truncate text-[38px] leading-[46px] text-ink sm:text-[56px] sm:leading-[68px]"
							style={{ fontFamily: `"${font.name}", serif` }}
						>
							{previewWords}
						</span>
					)}
					{(status === 'loading' || status === 'waiting') && <span className="block h-[30px] translate-y-[8px] rounded bg-[#F2F3F1] sm:h-[40px] sm:w-[60%] sm:translate-y-[14px]" />}
				</span>
			</button>
			{status === 'failed' && (
				<span className="absolute top-[28px] left-[18px] text-[15px] text-muted sm:top-[38px]">
					Preview didn’t load ·{' '}
					<button
						type="button"
						onClick={() => setRetryCount((count) => count + 1)}
						className="cursor-pointer border-0 bg-transparent p-0 text-ink underline underline-offset-[3px]"
					>
						Try again
					</button>
				</span>
			)}
			<div className="absolute right-[18px] bottom-[10px] left-[18px] flex flex-wrap items-center gap-x-[10px] caption text-secondary sm:bottom-[14px] sm:flex-nowrap">
				<span className={rank === 1 ? 'text-accent' : ''}>{rankLabel}</span>
				<span aria-hidden="true">·</span>
				<span className="max-w-full shrink-0 truncate sm:shrink">{font.name}</span>
				<span aria-hidden="true">·</span>
				<span className="shrink-0 whitespace-nowrap text-accent">{licenceLabel(font.license)}</span>
				<button
					type="button"
					onClick={() => onMoreLikeThis(font)}
					className="ml-auto min-h-[32px] shrink-0 cursor-pointer border-0 bg-transparent px-1 caption text-ink underline underline-offset-[3px] opacity-100 decoration-1 hover:decoration-2 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 sm:group-focus-within:opacity-100"
				>
					More like this
				</button>
			</div>
		</li>
	);
}
