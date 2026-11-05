import { useEffect, useRef, useState } from 'react';
import { renderGoogleButton } from '../../lib/googleIdentity';
import { Logo } from '../Logo';

interface SignInDialogProps {
	title: string;
	isSigningIn: boolean;
	failure: string | null;
	onCredential: (credential: string) => void;
	onClose: () => void;
}

/** Asked for only when something needs an account. Google is the only way in; "Not now" leaves everything as it was. */
export function SignInDialog({ title, isSigningIn, failure, onCredential, onClose }: SignInDialogProps) {
	const buttonRef = useRef<HTMLDivElement>(null);
	const dialogRef = useRef<HTMLDivElement>(null);
	const [loadFailure, setLoadFailure] = useState<string | null>(null);

	useEffect(() => {
		dialogRef.current?.focus();
		if (buttonRef.current) {
			renderGoogleButton(buttonRef.current, onCredential).catch((error: Error) => setLoadFailure(error.message));
		}
		const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
		document.addEventListener('keydown', onKeyDown);
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [onCredential, onClose]);

	const message = failure ?? loadFailure;
	return (
		<div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
			<div className="absolute inset-0 animate-scrim-in bg-[rgba(22,32,27,0.36)]" onClick={onClose} aria-hidden="true" />
			<div
				ref={dialogRef}
				tabIndex={-1}
				role="dialog"
				aria-modal="true"
				aria-labelledby="sign-in-title"
				className="relative flex w-full animate-dialog-in flex-col gap-[18px] rounded-t-2xl border border-ink bg-paper p-6 pb-8 outline-none sm:w-[400px] sm:rounded-xl sm:p-7"
			>
				<Logo size={14} />
				<div className="flex flex-col gap-2">
					<h2 id="sign-in-title" className="m-0 text-[22px] leading-7 font-semibold tracking-[-0.015em]">
						{title}
					</h2>
					<p className="m-0 text-[15px] leading-[22px] tracking-[-0.005em] text-secondary">
						Sign in to save fonts and your trails, and find them on any device. Searching never needs an account.
					</p>
				</div>
				{message && (
					<p role="alert" className="m-0 rounded-lg bg-error-tint px-3 py-[10px] text-[14px] leading-5 text-error-ink">
						{failure ? `${failure} Nothing was saved yet. Try again, or keep searching without an account.` : message}
					</p>
				)}
				<div ref={buttonRef} className={`flex min-h-[44px] justify-center ${isSigningIn ? 'pointer-events-none opacity-50' : ''}`} aria-busy={isSigningIn} />
				<p className="m-0 text-[13px] leading-[19px] text-muted">We keep your name, email, saved fonts and trails. Nothing else, and you can delete it any time.</p>
				<button type="button" onClick={onClose} className="min-h-8 cursor-pointer self-center border-0 bg-transparent text-[14px] font-medium text-ink underline underline-offset-[3px]">
					Not now
				</button>
			</div>
		</div>
	);
}
