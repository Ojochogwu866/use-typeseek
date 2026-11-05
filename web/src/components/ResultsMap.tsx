import { useEffect, useRef } from 'react';
import type { FontResult } from '../api/types';
import { useMapData, type MapData } from '../hooks/useMapData';

const INK = '#16201B';
const GREEN = '#0F6B46';

interface ResultsMapProps {
	isCompact?: boolean;
	results: FontResult[];
	trail: string[];
	selectedName: string | null;
}

interface Placed {
	x: number;
	y: number;
}

const NEAR_DISTANCE = 0.22;
const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

/** Splits the labelled results into those near the lead font (framed) and stragglers elsewhere on the map. */
function splitByDistance(data: MapData, names: string[], trail: string[]) {
	const anchorName = trail.at(-1) ?? names[0];
	const anchor = anchorName === undefined ? undefined : data.indexByName.get(anchorName);
	const near: number[] = [];
	const far: { rank: number; arrow: string }[] = [];
	names.slice(0, 6).forEach((name, rank) => {
		const index = data.indexByName.get(name);
		if (index === undefined || anchor === undefined) return;
		const dx = data.fonts[index][0] - data.fonts[anchor][0];
		const dy = data.fonts[index][1] - data.fonts[anchor][1];
		if (Math.hypot(dx, dy) <= NEAR_DISTANCE) near.push(index);
		else far.push({ rank: rank + 1, arrow: ARROWS[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8] });
	});
	return { near, far };
}

function regionOf(data: MapData, names: string[]): string | null {
	const counts = new Map<number, number>();
	for (const name of names) {
		const index = data.indexByName.get(name);
		if (index === undefined) continue;
		const region = data.fonts[index][2];
		counts.set(region, (counts.get(region) ?? 0) + 1);
	}
	const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
	return top ? data.regions[top[0]].name : null;
}

/** Where the results sit on the map of type. A picture of the list beside it, not a second control. */
export function ResultsMap({ isCompact = false, results, trail, selectedName }: ResultsMapProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { data } = useMapData();
	const namesKey = results.map((font) => font.name).join('|');
	const trailKey = trail.join('|');
	const region = data ? regionOf(data, namesKey.split('|')) : null;
	const stragglers = data ? splitByDistance(data, namesKey.split('|'), trail).far : [];

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !data) return;
		const ratio = devicePixelRatio || 1;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		canvas.width = width * ratio;
		canvas.height = height * ratio;
		const context = canvas.getContext('2d');
		if (!context) return;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		const names = namesKey ? namesKey.split('|') : [];
		const trailNames = trailKey ? trailKey.split('|') : [];

		// Frame the results near the lead font and the trail; a far-off straggler gets a note instead.
		const trailIndexes = trailNames.map((name) => data.indexByName.get(name)).filter((index) => index !== undefined);
		const focus = [...splitByDistance(data, names, trailNames).near, ...trailIndexes];
		const xs = focus.map((index) => data.fonts[index][0]);
		const ys = focus.map((index) => data.fonts[index][1]);
		const span = Math.max(0.12, Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * 2);
		const centreX = focus.length ? (Math.max(...xs) + Math.min(...xs)) / 2 : 0.5;
		const centreY = focus.length ? (Math.max(...ys) + Math.min(...ys)) / 2 : 0.5;
		const scale = (width * 0.8) / span;
		const place = (index: number): Placed => ({
			x: (data.fonts[index][0] - centreX) * scale + width / 2,
			y: (data.fonts[index][1] - centreY) * scale * 0.5 + height / 2,
		});

		context.clearRect(0, 0, width, height);
		const dotRadius = span > 0.2 ? 1.6 : 2.4;
		context.fillStyle = INK;
		context.globalAlpha = 0.28;
		for (let index = 0; index < data.fonts.length; index += 1) {
			const { x, y } = place(index);
			if (x < -4 || x > width + 4 || y < -4 || y > height + 4) continue;
			context.beginPath();
			context.arc(x, y, dotRadius, 0, Math.PI * 2);
			context.fill();
		}
		context.globalAlpha = 1;

		const trailPoints = trailNames.map((name) => data.indexByName.get(name)).filter((index) => index !== undefined).map(place);
		if (trailPoints.length > 1) {
			context.strokeStyle = GREEN;
			context.lineWidth = 2;
			context.beginPath();
			trailPoints.forEach(({ x, y }, index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
			context.stroke();
		}
		for (const { x, y } of trailPoints) {
			context.fillStyle = GREEN;
			context.beginPath();
			context.arc(x, y, 4.5, 0, Math.PI * 2);
			context.fill();
		}

		context.font = '11px "IBM Plex Mono", monospace';
		names.slice(0, 6).forEach((name, rank) => {
			const index = data.indexByName.get(name);
			if (index === undefined) return;
			const { x, y } = place(index);
			const isCurrent = name === selectedName || (selectedName === null && rank === 0);
			context.fillStyle = isCurrent ? GREEN : INK;
			context.beginPath();
			context.arc(x, y, isCurrent ? 7 : 5, 0, Math.PI * 2);
			context.fill();
			context.fillStyle = INK;
			context.fillText(String(rank + 1).padStart(2, '0'), x + 9, y + 4);
		});
	}, [data, namesKey, trailKey, selectedName, isCompact]);

	return (
		<figure className="m-0">
			<div className={`relative overflow-hidden bg-ground ${isCompact ? 'h-[120px] rounded-lg' : 'h-[372px] rounded-[10px]'}`}>
				<canvas
					ref={canvasRef}
					className="h-full w-full"
					role="img"
					aria-label={region ? `Map: your results sit in the ${region} region` : 'Map of where your results sit'}
				/>
				{stragglers.length > 0 && (
					<p className="absolute top-3 left-3 m-0 rounded bg-[rgba(238,240,236,0.9)] px-1.5 caption text-secondary">
						{stragglers.map(({ rank, arrow }) => `${arrow} ${String(rank).padStart(2, '0')}`).join('  ')} · in another region
					</p>
				)}
			</div>
			<figcaption className={`flex justify-between caption text-secondary ${isCompact ? 'mt-2' : 'mt-3'}`}>
				<span>{region ? `${region} · where your results sit` : 'Where your results sit'}</span>
				<a href="/" className="text-ink underline underline-offset-[3px]">
					Whole map
				</a>
			</figcaption>
		</figure>
	);
}
