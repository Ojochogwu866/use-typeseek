import { useEffect, useState } from 'react';
import { loadFamily } from '../lib/fontLoader';

const SLOW_AFTER_MS = 3000;

export type FontStatus = 'waiting' | 'loading' | 'ready' | 'failed';

/**
 * Loads one Google Fonts family once it is wanted and reports whether it can be shown.
 * After three seconds it reports failed, but a font that arrives later still appears.
 */
export function useFontStatus(name: string, isWanted = true, retryKey = 0): FontStatus {
	const [status, setStatus] = useState<{ name: string; value: FontStatus }>({ name, value: 'waiting' });

	useEffect(() => {
		if (!isWanted) return;
		let isCurrent = true;
		setStatus((current) => (current.name === name && current.value === 'ready' ? current : { name, value: 'loading' }));
		const slowTimer = setTimeout(() => {
			if (isCurrent) setStatus((current) => (current.value === 'ready' ? current : { name, value: 'failed' }));
		}, SLOW_AFTER_MS);
		loadFamily(name).then((isReady) => {
			if (!isCurrent) return;
			clearTimeout(slowTimer);
			setStatus({ name, value: isReady ? 'ready' : 'failed' });
		});
		return () => {
			isCurrent = false;
			clearTimeout(slowTimer);
		};
	}, [name, isWanted, retryKey]);

	return status.name === name ? status.value : 'waiting';
}
