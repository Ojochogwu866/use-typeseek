import { useEffect, useState, type RefObject } from 'react';

/** True once the element comes within a screen of the viewport; stays true after that. */
export function useIsNearView(ref: RefObject<Element | null>): boolean {
	const [isNear, setIsNear] = useState(typeof IntersectionObserver === 'undefined');

	useEffect(() => {
		const element = ref.current;
		if (!element || isNear) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setIsNear(true);
					observer.disconnect();
				}
			},
			{ rootMargin: '100% 0px' }
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref, isNear]);

	return isNear;
}
