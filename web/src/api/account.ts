import { API_URL, request } from './http';
import type { FontResult } from './types';

export interface SavedFont {
	font: FontResult;
	found_with: string;
	trail_id: number | null;
	saved_at: string;
}

export interface Trail {
	id: number;
	origin: string;
	steps: FontResult[];
	saved_at: string;
}

export interface Saved {
	fonts: SavedFont[];
	trails: Trail[];
}

export interface Preferences {
	preview_words: string;
	license: string;
	is_map_shown: boolean;
}

export interface SaveRequest {
	font_id: number;
	found_with: string;
	trail?: { origin: string; font_ids: number[] };
}

const json = { 'Content-Type': 'application/json' };

export const listSaved = () => request<Saved>(`${API_URL}/me/saved`);

export const saveFont = (body: SaveRequest) =>
	request<SavedFont>(`${API_URL}/me/saved`, { method: 'POST', headers: json, body: JSON.stringify(body) });

export const removeSavedFont = (fontId: number) => request<void>(`${API_URL}/me/saved/${fontId}`, { method: 'DELETE' });

export const removeTrail = (trailId: number) => request<void>(`${API_URL}/me/trails/${trailId}`, { method: 'DELETE' });

export const getPreferences = () => request<Preferences>(`${API_URL}/me/preferences`);

export const setPreferences = (preferences: Preferences) =>
	request<Preferences>(`${API_URL}/me/preferences`, { method: 'PUT', headers: json, body: JSON.stringify(preferences) });

export const deleteAccount = () => request<void>(`${API_URL}/me`, { method: 'DELETE' });

export const exportUrl = `${API_URL}/me/export`;
