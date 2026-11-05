import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ShowToast, type Toast } from '../contexts/toastContext';

const SUCCESS_TIMEOUT_MS = 4000;


/** One toast at a time, bottom left. Successes leave after four seconds; errors stay until dismissed. */
export function ToastProvider({ children }: { children: ReactNode }) {
	const [toast, setToast] = useState<Toast | null>(null);
	const nextId = useRef(0);

	const show = useCallback<ShowToast>((next) => {
		nextId.current += 1;
		setToast({ ...next, id: nextId.current });
	}, []);

	useEffect(() => {
		if (!toast || toast.tone === 'error') return;
		const timer = setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), SUCCESS_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [toast]);

	const isError = toast?.tone === 'error';
	return (
		<ToastContext.Provider value={show}>
			{children}
			<div role={isError ? 'alert' : 'status'} className="pointer-events-none fixed top-4 right-4 left-4 z-50 sm:top-auto sm:right-auto sm:bottom-6 sm:left-6">
				{toast && (
					<div
						key={toast.id}
						className={`pointer-events-auto flex min-h-11 animate-toast-in items-center gap-4 rounded-lg px-4 text-[14px] ${
							isError ? 'border border-error bg-error-tint text-error-ink' : 'bg-ink text-paper'
						}`}
					>
						<span>{toast.message}</span>
						{toast.action && (
							<button
								type="button"
								onClick={() => {
									toast.action?.onClick();
									setToast(null);
								}}
								className="min-h-8 cursor-pointer border-0 bg-transparent p-0 font-medium text-inherit underline underline-offset-[3px]"
							>
								{toast.action.label}
							</button>
						)}
						{isError && (
							<button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="h-8 w-8 cursor-pointer border-0 bg-transparent text-[16px] text-inherit">
								×
							</button>
						)}
					</div>
				)}
			</div>
		</ToastContext.Provider>
	);
}
