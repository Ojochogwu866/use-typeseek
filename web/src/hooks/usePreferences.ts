import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPreferences, setPreferences, type Preferences } from '../api/account';
import { useAuth } from './useAuth';

const STORAGE_KEY = 'typeseek:preferences';
const LEGACY_WORDS_KEY = 'typeseek:preview-words';
export const DEFAULT_PREFERENCES: Preferences = { preview_words: 'The Evening Edition', license: '', is_map_shown: true };

function readLocal(): Preferences {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) return { ...DEFAULT_PREFERENCES, ...(JSON.parse(stored) as Partial<Preferences>) };
		const words = localStorage.getItem(LEGACY_WORDS_KEY);
		return words ? { ...DEFAULT_PREFERENCES, preview_words: words } : DEFAULT_PREFERENCES;
	} catch {
		return DEFAULT_PREFERENCES;
	}
}

function writeLocal(preferences: Preferences) {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
	} catch (error) {
		console.warn('preferences not saved on this device', error);
	}
}

/** Search preferences: kept on the account when signed in, on this device otherwise. */
export function usePreferences() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const local = useQuery({ queryKey: ['preferences', 'local'], queryFn: readLocal, staleTime: Infinity });
	const remote = useQuery({ queryKey: ['preferences', user?.id], queryFn: getPreferences, enabled: user !== null, retry: false });
	const remoteSave = useMutation({
		mutationFn: setPreferences,
		onSuccess: (saved) => queryClient.setQueryData(['preferences', user?.id], saved),
	});

	const preferences = (user ? remote.data : null) ?? local.data ?? DEFAULT_PREFERENCES;

	const update = (patch: Partial<Preferences>) => {
		const next = { ...preferences, ...patch };
		next.preview_words = next.preview_words.trim() || DEFAULT_PREFERENCES.preview_words;
		writeLocal(next);
		queryClient.setQueryData(['preferences', 'local'], next);
		if (user) {
			queryClient.setQueryData(['preferences', user.id], next);
			return remoteSave.mutateAsync(next);
		}
		return Promise.resolve(next);
	};

	return { preferences, update, isSaving: remoteSave.isPending };
}
