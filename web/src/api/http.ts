export const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8080';

async function parseOrThrow<T>(response: Response): Promise<T> {
	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(
			body.error ?? `request failed with status ${response.status}`
		);
	}
	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
}

export async function request<T>(
	input: RequestInfo,
	init?: RequestInit
): Promise<T> {
	let response: Response;
	try {
		// credentials: "include" so the session cookie flows on this cross-origin request
		// (API on a different port than the frontend in dev, a different origin in prod).
		response = await fetch(input, { credentials: 'include', ...init });
	} catch {
		throw new Error(
			"Can't reach the server. Check your connection and try again."
		);
	}
	return parseOrThrow<T>(response);
}
