import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listSaved, removeSavedFont, removeTrail, saveFont, type Saved, type SaveRequest } from '../api/account';
import { useAuth } from './useAuth';

/** The signed-in user's saved fonts and trails, with save and remove. Empty while signed out. */
export function useSaved() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const key = ['saved', user?.id];

	const saved = useQuery({ queryKey: key, queryFn: listSaved, enabled: user !== null, retry: false });
	const refresh = () => queryClient.invalidateQueries({ queryKey: ['saved'] });

	const save = useMutation({
		mutationFn: (request: SaveRequest) => saveFont(request),
		onSuccess: (item) => {
			const previous = queryClient.getQueryData<Saved>(key);
			if (previous) queryClient.setQueryData<Saved>(key, { ...previous, fonts: [item, ...previous.fonts.filter((existing) => existing.font.id !== item.font.id)] });
			refresh();
		},
	});
	const remove = useMutation({
		mutationFn: removeSavedFont,
		onMutate: (fontId: number) => {
			const previous = queryClient.getQueryData<Saved>(key);
			if (previous) queryClient.setQueryData<Saved>(key, { ...previous, fonts: previous.fonts.filter((item) => item.font.id !== fontId) });
			return { previous };
		},
		onError: (_error, _fontId, context) => context?.previous && queryClient.setQueryData(key, context.previous),
		onSettled: refresh,
	});
	const removeTrailMutation = useMutation({ mutationFn: removeTrail, onSettled: refresh });

	const savedIds = new Set(saved.data?.fonts.map((item) => item.font.id) ?? []);
	return { saved, savedIds, save, remove, removeTrail: removeTrailMutation };
}
