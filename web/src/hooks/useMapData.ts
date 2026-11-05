import { useQuery } from '@tanstack/react-query';

export interface MapRegion {
	name: string;
	colour: string;
	x: number;
	y: number;
}

/** x, y in 0–1, region index, font name, font id. */
export type MapFont = [number, number, number, string, number];

export interface MapData {
	regions: MapRegion[];
	fonts: MapFont[];
	indexByName: Map<string, number>;
}

async function fetchMapData(): Promise<MapData> {
	const response = await fetch('/map-data.json');
	if (!response.ok) throw new Error(`map data failed with status ${response.status}`);
	const raw = (await response.json()) as { regions: MapRegion[]; fonts: MapFont[] };
	return { ...raw, indexByName: new Map(raw.fonts.map((font, index) => [font[3], index])) };
}

/** Positions of every indexed font on the map of type, fetched once and cached for the session. */
export function useMapData() {
	return useQuery({ queryKey: ['map-data'], queryFn: fetchMapData, staleTime: Infinity });
}
