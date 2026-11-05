import { useEffect, useRef } from 'react';
import type { FontResult } from '../api/types';
import { useFontStatus } from '../hooks/useFontStatus';
import { licenceLabel } from '../lib/licence';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ\nabcdefghijklmnopqrstuvwxyz\n0123456789 &?!';

interface FontDrawerProps {
	font: FontResult;
	position: string;
	previewWords: string;
	isClosing: boolean;
	isSaved: boolean;
	isSaving: boolean;
	onSave: (font: FontResult) => void;
	onClose: () => void;
	onMoreLikeThis: (font: FontResult) => void;
}

/** Full view of one font, sliding in from the right over a dimmed page. */
export function FontDrawer({ font, position, previewWords, isClosing, isSaved, isSaving, onSave, onClose, onMoreLikeThis }: FontDrawerProps) {
	const closeRef = useRef<HTMLButtonElement>(null);
	const drawerRef = useRef<HTMLElement>(null);
	const status = useFontStatus(font.name);
	const face = { fontFamily: `"${font.name}", serif` };

	useEffect(() => {
		closeRef.current?.focus();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
			if (event.key !== 'Tab' || !drawerRef.current) return;
			// Keep keyboard focus inside the drawer while it is open.
			const focusable = drawerRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [onClose]);

	return (
		<div className="fixed inset-0 z-30">
			<div
				className={`absolute inset-0 bg-[rgba(22,32,27,0.36)] ${isClosing ? 'animate-scrim-out' : 'animate-scrim-in'}`}
				onClick={onClose}
				aria-hidden="true"
			/>
			<aside
				ref={drawerRef}
				role="dialog"
				aria-modal="true"
				aria-label={`${font.name} details`}
				className={`absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-2xl border-t border-ink bg-paper sm:inset-x-auto sm:top-0 sm:right-0 sm:max-h-none sm:w-[620px] sm:rounded-none sm:border-t-0 sm:border-l ${
					isClosing ? 'animate-sheet-out sm:animate-drawer-out' : 'animate-sheet-in sm:animate-drawer-in'
				}`}
			>
				<span className="mx-auto mt-2 block h-1 w-9 shrink-0 rounded-full bg-[#C9CFC8] sm:hidden" aria-hidden="true" />
				<header className="flex h-14 shrink-0 items-center justify-between border-b border-rule px-4 sm:h-[72px] sm:px-7">
					<span className="caption text-secondary">{position}</span>
					<button
						ref={closeRef}
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line bg-paper text-[16px] hover:border-ink"
					>
						×
					</button>
				</header>

				<div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-7 sm:pb-8">
					<h2 className="mt-5 mb-1 truncate text-[34px] leading-[40px] font-normal sm:mt-7 sm:text-[40px] sm:leading-[48px]" style={status === 'ready' ? face : undefined}>
						{font.name}
					</h2>
					<p className="m-0 caption text-secondary">
						{font.category} · Google Fonts · <span className="text-accent">{licenceLabel(font.license)}</span>
					</p>

					<div className="mt-5 border-y border-rule py-4 sm:mt-7 sm:py-6">
						{status === 'ready' ? (
							<p className="m-0 animate-fade-in text-[50px] leading-[56px] break-words sm:text-[72px] sm:leading-[84px]" style={face}>
								{previewWords}
							</p>
						) : status === 'loading' || status === 'waiting' ? (
							<span className="block h-14 w-3/4 rounded bg-[#F2F3F1] sm:h-[84px]" />
						) : (
							<p className="m-0 text-[15px] text-muted">The preview didn’t load. The font is still available from Google Fonts.</p>
						)}
					</div>

					{status === 'ready' && (
						<p className="mt-5 mb-0 animate-fade-in text-[20px] leading-[27px] whitespace-pre-line sm:mt-7 sm:text-[24px] sm:leading-[34px]" style={face}>
							{ALPHABET}
						</p>
					)}
				</div>

				<footer className="grid shrink-0 grid-cols-[1fr_auto] gap-[10px] border-t border-rule px-4 pt-[14px] pb-6 sm:flex sm:gap-3 sm:px-7 sm:py-5">
					<a
						href={font.source_url}
						target="_blank"
						rel="noreferrer"
						className="col-span-2 flex h-11 flex-1 items-center justify-center rounded-lg bg-ink px-5 text-[15px] font-medium text-paper no-underline hover:bg-[#2A3631] active:bg-black"
					>
						Get it on Google Fonts ↗
					</a>
					<button
						type="button"
						onClick={() => onMoreLikeThis(font)}
						className="flex h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border border-ink bg-paper px-5 text-[15px] font-medium hover:bg-tint"
					>
						More like this
					</button>
					<button
						type="button"
						onClick={() => onSave(font)}
						disabled={isSaving}
						aria-pressed={isSaved}
						className={`flex h-11 cursor-pointer items-center justify-center rounded-lg border px-[18px] text-[15px] font-medium disabled:cursor-default disabled:opacity-40 ${
							isSaved ? 'border-accent bg-paper text-accent' : 'border-line bg-paper hover:border-ink'
						}`}
					>
						{isSaved ? 'Saved' : 'Save'}
					</button>
				</footer>
			</aside>
		</div>
	);
}
