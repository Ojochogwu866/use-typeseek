import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { exportUrl } from '../../api/account';
import type { AuthUser } from '../../api/auth';
import { usePreferences } from '../../hooks/usePreferences';
import { useSaved } from '../../hooks/useSaved';
import { LicenseFilter } from '../LicenseFilter';
import { useToast } from '../../contexts/toastContext';
import { DeleteAccountDialog } from './DeleteAccountDialog';

interface SettingsDrawerProps {
	user: AuthUser | null;
	isClosing: boolean;
	isDeleting: boolean;
	onClose: () => void;
	onSignIn: () => void;
	onSignOut: () => void;
	onDeleteAccount: () => void;
}

function Row({ label, note, children, isStacked = false }: { label: string; note: string; children: ReactNode; isStacked?: boolean }) {
	const labelId = useId();
	return (
		<div role="group" aria-labelledby={labelId} className={`flex gap-4 border-b border-rule py-4 ${isStacked ? 'flex-col gap-[10px]' : 'items-center justify-between'}`}>
			<div className="flex flex-col gap-[3px]">
				<span id={labelId} className="text-[15px] font-medium">
					{label}
				</span>
				<span className="text-[13px] leading-[19px] text-muted">{note}</span>
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

/** Search preferences and the account, in a drawer opened from the account initial. */
export function SettingsDrawer({ user, isClosing, isDeleting, onClose, onSignIn, onSignOut, onDeleteAccount }: SettingsDrawerProps) {
	const { preferences, update } = usePreferences();
	const { saved } = useSaved();
	const showToast = useToast();
	const [draftWords, setDraftWords] = useState(preferences.preview_words);
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
	const closeRef = useRef<HTMLButtonElement>(null);
	const switchId = useId();

	useEffect(() => {
		closeRef.current?.focus();
		const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && !isConfirmingDelete && onClose();
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [onClose, isConfirmingDelete]);

	const save = (patch: Parameters<typeof update>[0]) =>
		update(patch).catch((error: Error) => showToast({ tone: 'error', message: `Couldn’t save that setting. ${error.message}` }));

	const fontCount = saved.data?.fonts.length ?? 0;
	const trailCount = saved.data?.trails.length ?? 0;

	return (
		<div className="fixed inset-0 z-30">
			<div className={`absolute inset-0 bg-[rgba(22,32,27,0.36)] ${isClosing ? 'animate-scrim-out' : 'animate-scrim-in'}`} onClick={onClose} aria-hidden="true" />
			<aside
				role="dialog"
				aria-modal="true"
				aria-labelledby="settings-title"
				className={`absolute inset-y-0 right-0 flex w-full flex-col border-l border-ink bg-paper sm:w-[480px] ${isClosing ? 'animate-drawer-out' : 'animate-drawer-in'}`}
			>
				<header className="flex h-[72px] shrink-0 items-center justify-between border-b border-rule px-4 sm:px-7">
					<h2 id="settings-title" className="m-0 text-[20px] font-semibold tracking-[-0.015em]">
						Settings
					</h2>
					<button ref={closeRef} type="button" onClick={onClose} aria-label="Close settings" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line bg-paper text-[16px] hover:border-ink">
						×
					</button>
				</header>

				<div className="flex-1 overflow-y-auto px-4 pt-2 sm:px-7">
					<h3 className="m-0 pt-5 pb-1 caption font-normal text-secondary">Search</h3>
					<Row label="Preview words" note="Set in every result when your search doesn’t give its own." isStacked>
						<input
							aria-label="Preview words"
							value={draftWords}
							maxLength={80}
							onChange={(event) => setDraftWords(event.target.value)}
							onBlur={() => draftWords !== preferences.preview_words && save({ preview_words: draftWords })}
							className="h-11 w-full rounded-[10px] border border-line bg-paper px-3 text-[15px] focus:border-ink focus:outline-none sm:w-[424px]"
						/>
					</Row>
					<Row label="Licence" note="What results show first.">
						<LicenseFilter value={preferences.license} onChange={(license) => save({ license })} />
					</Row>
					<Row label="Show the map with results" note="Off gives the specimens the full width.">
						<button
							id={switchId}
							type="button"
							role="switch"
							aria-checked={preferences.is_map_shown}
							aria-label="Show the map with results"
							onClick={() => save({ is_map_shown: !preferences.is_map_shown })}
							className={`flex h-[26px] w-11 cursor-pointer items-center rounded-full border-0 p-[3px] transition-colors duration-[120ms] ${preferences.is_map_shown ? 'justify-end bg-accent' : 'justify-start bg-off'}`}
						>
							<span className="block h-5 w-5 rounded-full bg-paper" />
						</button>
					</Row>

					<h3 className="m-0 pt-7 pb-1 caption font-normal text-secondary">Account</h3>
					{user ? (
						<>
							<div className="flex items-center gap-[14px] border-b border-rule py-[14px]">
								<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ground text-[15px] font-semibold" aria-hidden="true">
									{(user.name || user.email).slice(0, 1).toUpperCase()}
								</span>
								<div className="flex min-w-0 flex-col gap-[2px]">
									<span className="truncate text-[15px] font-medium">{user.name || user.email}</span>
									<span className="truncate font-mono text-[13px] text-secondary">{user.email} · Google</span>
								</div>
								<button type="button" onClick={onSignOut} className="ml-auto h-9 shrink-0 cursor-pointer rounded-lg border border-line bg-paper px-[14px] text-[14px] font-medium hover:border-ink">
									Sign out
								</button>
							</div>
							<Row label="Your data" note={`Name, email, ${fontCount} saved ${fontCount === 1 ? 'font' : 'fonts'} and ${trailCount} ${trailCount === 1 ? 'trail' : 'trails'}, as one file.`}>
								<a
									href={exportUrl}
									onClick={() => showToast({ tone: 'success', message: 'Preparing your data… it downloads when ready' })}
									className="flex h-9 items-center rounded-lg border border-line bg-paper px-[14px] text-[14px] font-medium text-ink no-underline hover:border-ink"
								>
									Download
								</a>
							</Row>
							<Row label="Delete account" note="Removes everything we keep. This can’t be undone.">
								<button type="button" onClick={() => setIsConfirmingDelete(true)} className="h-9 cursor-pointer rounded-lg border border-error bg-paper px-[14px] text-[14px] font-medium text-error hover:bg-error-tint">
									Delete
								</button>
							</Row>
						</>
					) : (
						<Row label="Not signed in" note="Sign in to keep saved fonts and these settings on any device.">
							<button type="button" onClick={onSignIn} className="h-9 cursor-pointer rounded-lg border border-ink bg-paper px-[14px] text-[14px] font-medium hover:bg-tint">
								Sign in
							</button>
						</Row>
					)}
				</div>

				<p className="m-0 border-t border-rule px-4 py-5 text-[13px] leading-[19px] text-muted sm:px-7">
					Searches and photos aren’t stored. Signed out, these preferences stay on this device only.
				</p>
			</aside>
			{isConfirmingDelete && (
				<DeleteAccountDialog fontCount={fontCount} trailCount={trailCount} isDeleting={isDeleting} onConfirm={onDeleteAccount} onCancel={() => setIsConfirmingDelete(false)} />
			)}
		</div>
	);
}
