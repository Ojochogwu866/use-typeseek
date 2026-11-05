const stylesheetRequests = new Map<string, Promise<void>>();
const familyLoads = new Map<string, Promise<boolean>>();
let pendingFamilies: string[] = [];
let pendingFlush: Promise<void> | null = null;

function stylesheetUrl(families: string[]): string {
	const query = families
		.map((name) => `family=${encodeURIComponent(name).replace(/%20/g, '+')}`)
		.join('&');
	return `https://fonts.googleapis.com/css2?${query}&display=block`;
}

// Families asked for in the same tick share one stylesheet request.
function requestStylesheet(name: string): Promise<void> {
	const existing = stylesheetRequests.get(name);
	if (existing) return existing;
	pendingFamilies.push(name);
	pendingFlush ??= Promise.resolve().then(
		() =>
			new Promise<void>((resolve) => {
				const families = pendingFamilies;
				pendingFamilies = [];
				pendingFlush = null;
				const link = document.createElement('link');
				link.rel = 'stylesheet';
				link.href = stylesheetUrl(families);
				link.addEventListener('load', () => resolve(), { once: true });
				link.addEventListener('error', () => resolve(), { once: true });
				document.head.appendChild(link);
			})
	);
	stylesheetRequests.set(name, pendingFlush);
	return pendingFlush;
}

/** Resolves true once the family can render, false if Google Fonts can't supply it. */
export function loadFamily(name: string): Promise<boolean> {
	const existing = familyLoads.get(name);
	if (existing) return existing;
	const load = requestStylesheet(name)
		.then(() => document.fonts.load(`32px "${name}"`))
		.then((faces) => faces.length > 0)
		.catch(() => false)
		.then((isReady) => {
			// Forget a failure so "Try again" fetches afresh.
			if (!isReady) {
				familyLoads.delete(name);
				stylesheetRequests.delete(name);
			}
			return isReady;
		});
	familyLoads.set(name, load);
	return load;
}
