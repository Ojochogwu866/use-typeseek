import { useEffect, useRef, useState } from 'react';

interface DeleteAccountDialogProps {
	fontCount: number;
	trailCount: number;
	isDeleting: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

/** Names what will go, points to the download first, and needs a tick before Delete works. */
export function DeleteAccountDialog({ fontCount, trailCount, isDeleting, onConfirm, onCancel }: DeleteAccountDialogProps) {
	const [isUnderstood, setIsUnderstood] = useState(false);
	const keepRef = useRef<HTMLButtonElement>(null);
	useEffect(() => keepRef.current?.focus(), []);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center px-4">
			<div className="absolute inset-0 animate-scrim-in bg-[rgba(22,32,27,0.36)]" onClick={onCancel} aria-hidden="true" />
			<div role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-body" className="relative flex w-full max-w-[400px] animate-dialog-in flex-col gap-[14px] rounded-xl border border-ink bg-paper p-6">
				<h2 id="delete-title" className="m-0 text-[20px] leading-7 font-semibold tracking-[-0.015em]">
					Delete your account?
				</h2>
				<p id="delete-body" className="m-0 text-[14px] leading-[21px] text-secondary">
					This removes your name, email, {fontCount} saved {fontCount === 1 ? 'font' : 'fonts'} and {trailCount} {trailCount === 1 ? 'trail' : 'trails'}, now and for good. Download your data first if you want a copy.
				</p>
				<label className="flex min-h-8 cursor-pointer items-center gap-[10px] text-[14px]">
					<input type="checkbox" checked={isUnderstood} onChange={(event) => setIsUnderstood(event.target.checked)} className="h-[18px] w-[18px] accent-ink" />
					I understand this can’t be undone
				</label>
				<div className="flex justify-end gap-[10px]">
					<button ref={keepRef} type="button" onClick={onCancel} className="h-10 cursor-pointer rounded-lg border border-line bg-paper px-4 text-[14px] font-medium hover:border-ink">
						Keep my account
					</button>
					<button
						type="button"
						disabled={!isUnderstood || isDeleting}
						onClick={onConfirm}
						className="h-10 cursor-pointer rounded-lg border-0 bg-error px-4 text-[14px] font-medium text-paper disabled:cursor-default disabled:opacity-40"
					>
						{isDeleting ? 'Deleting…' : 'Delete account'}
					</button>
				</div>
			</div>
		</div>
	);
}
