const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let handleCredential: (credential: string) => void = () => {};
let isInitialised = false;

function whenScriptReady(): Promise<void> {
	if (window.google) return Promise.resolve();
	const script = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
	if (!script) return Promise.reject(new Error('Google sign-in script is missing from the page'));
	return new Promise((resolve, reject) => {
		script.addEventListener('load', () => resolve(), { once: true });
		script.addEventListener('error', () => reject(new Error('Google sign-in could not load')), { once: true });
	});
}

/** Draws Google's sign-in button into the element; credentials go to the latest handler. */
export async function renderGoogleButton(element: HTMLElement, onCredential: (credential: string) => void): Promise<void> {
	const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
	if (!clientId) throw new Error('Google sign-in is not configured');
	handleCredential = onCredential;
	await whenScriptReady();
	if (!window.google) throw new Error('Google sign-in could not load');
	// Initialise once; Google warns and misbehaves when initialize() runs repeatedly.
	if (!isInitialised) {
		window.google.accounts.id.initialize({ client_id: clientId, callback: (response) => handleCredential(response.credential) });
		isInitialised = true;
	}
	element.innerHTML = '';
	window.google.accounts.id.renderButton(element, { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular' });
}
