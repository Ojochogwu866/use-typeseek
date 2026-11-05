import { useEffect, useRef, useState } from 'react';
import { loadFamily } from '../lib/fontLoader';
import type { MapData } from '../hooks/useMapData';

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 14;
const NAMES_FROM_ZOOM = 4.5;
const HOVER_RADIUS_SQUARED = 144;
const HOVER_LOAD_DELAY_MS = 120;
const ASPECT = 0.49;

interface Camera {
	x: number;
	y: number;
	zoom: number;
}

interface MapExplorerProps {
	data: MapData;
	onPick: (fontId: number) => void;
}

interface Hover {
	index: number;
	left: number;
	top: number;
	isPreviewReady: boolean;
}

/**
 * The whole index as an explorable map. Until it is clicked or focused, the page scrolls normally;
 * after that the scroll, drag and arrow keys move the map. It redraws only when something changes.
 */
export function MapExplorer({ data, onPick }: MapExplorerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const camera = useRef<Camera>({ x: 0.5, y: 0.5, zoom: 1 });
	const velocity = useRef({ x: 0, y: 0 });
	const size = useRef({ width: 0, height: 0, base: 1 });
	const frame = useRef(0);
	const drag = useRef<{ x: number; y: number; time: number; distance: number } | null>(null);
	const hoveredIndex = useRef(-1);
	const hoverTimer = useRef(0);
	const [isActive, setIsActive] = useState(false);
	const [hover, setHover] = useState<Hover | null>(null);
	const isReducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context) return;

		const toScreen = (x: number, y: number) => {
			const scale = size.current.base * camera.current.zoom;
			return [(x - camera.current.x) * scale + size.current.width / 2, (y - camera.current.y) * scale * ASPECT + size.current.height / 2];
		};

		const draw = () => {
			frame.current = 0;
			const { width, height } = size.current;
			const moving = Math.abs(velocity.current.x) > 0.00002 || Math.abs(velocity.current.y) > 0.00002;
			if (moving) {
				camera.current.x = clamp(camera.current.x + velocity.current.x, 0, 1);
				camera.current.y = clamp(camera.current.y + velocity.current.y, 0, 1);
				velocity.current.x *= 0.9;
				velocity.current.y *= 0.9;
				frame.current = requestAnimationFrame(draw);
			}
			context.clearRect(0, 0, width, height);
			const zoom = camera.current.zoom;
			const radius = Math.min(2.2 + zoom * 0.45, 7);
			const isNamed = zoom >= NAMES_FROM_ZOOM;
			const placed: { left: number; right: number; top: number; bottom: number }[] = [];
			context.font = '11px "IBM Plex Mono", monospace';
			data.fonts.forEach(([x, y, region, name], index) => {
				const [screenX, screenY] = toScreen(x, y);
				if (screenX < -20 || screenX > width + 20 || screenY < -20 || screenY > height + 20) return;
				context.globalAlpha = index === hoveredIndex.current ? 1 : 0.85;
				context.fillStyle = data.regions[region].colour;
				context.beginPath();
				context.arc(screenX, screenY, radius, 0, Math.PI * 2);
				context.fill();
				if (!isNamed) return;
				const box = { left: screenX + radius + 3, top: screenY - 7, right: screenX + radius + 7 + context.measureText(name).width, bottom: screenY + 8 };
				if (placed.some((other) => !(box.right < other.left || box.left > other.right || box.bottom < other.top || box.top > other.bottom))) return;
				placed.push(box);
				context.globalAlpha = 1;
				context.fillStyle = '#3B4740';
				context.fillText(name, box.left + 1, screenY + 4);
			});
			context.globalAlpha = 1;
			if (!isNamed) {
				const labelBoxes: { left: number; right: number; top: number; bottom: number }[] = [];
				for (const region of data.regions) {
					const [screenX, screenY] = toScreen(region.x, region.y);
					const label = region.name.toUpperCase();
					const box = { left: screenX - 4, right: screenX + context.measureText(label).width + 18, top: screenY - 10, bottom: screenY + 10 };
					if (labelBoxes.some((other) => !(box.right < other.left || box.left > other.right || box.bottom < other.top || box.top > other.bottom))) continue;
					labelBoxes.push(box);
					context.fillStyle = 'rgba(238,240,236,0.9)';
					context.fillRect(box.left, box.top, box.right - box.left, 20);
					context.fillStyle = region.colour;
					context.beginPath();
					context.arc(screenX + 4, screenY, 3.5, 0, Math.PI * 2);
					context.fill();
					context.fillStyle = '#3B4740';
					context.fillText(label, screenX + 12, screenY + 4);
				}
			}
			if (hoveredIndex.current >= 0) {
				const [screenX, screenY] = toScreen(data.fonts[hoveredIndex.current][0], data.fonts[hoveredIndex.current][1]);
				context.strokeStyle = '#16201B';
				context.lineWidth = 2;
				context.beginPath();
				context.arc(screenX, screenY, radius + 5, 0, Math.PI * 2);
				context.stroke();
			}
		};

		const requestDraw = () => {
			if (!frame.current) frame.current = requestAnimationFrame(draw);
		};

		const resize = () => {
			const ratio = devicePixelRatio || 1;
			const { clientWidth: width, clientHeight: height } = canvas;
			canvas.width = width * ratio;
			canvas.height = height * ratio;
			context.setTransform(ratio, 0, 0, ratio, 0, 0);
			const isFirstSize = size.current.width === 0;
			size.current = { width, height, base: Math.min(width * 0.92, height * 1.9) };
			// On a narrow screen the whole map is too small to read, so start closer in, around the centre.
			if (isFirstSize && width < 640) camera.current = { x: 0.5, y: 0.5, zoom: 3 };
			requestDraw();
		};

		const toMap = (screenX: number, screenY: number) => {
			const scale = size.current.base * camera.current.zoom;
			return [(screenX - size.current.width / 2) / scale + camera.current.x, (screenY - size.current.height / 2) / (scale * ASPECT) + camera.current.y];
		};

		const zoomAt = (screenX: number, screenY: number, factor: number) => {
			const [beforeX, beforeY] = toMap(screenX, screenY);
			camera.current.zoom = clamp(camera.current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
			const [afterX, afterY] = toMap(screenX, screenY);
			camera.current.x = clamp(camera.current.x + beforeX - afterX, 0, 1);
			camera.current.y = clamp(camera.current.y + beforeY - afterY, 0, 1);
		};

		const nearest = (screenX: number, screenY: number) => {
			let best = -1;
			let bestDistance = HOVER_RADIUS_SQUARED;
			data.fonts.forEach(([x, y], index) => {
				const [fontX, fontY] = toScreen(x, y);
				const distance = (fontX - screenX) ** 2 + (fontY - screenY) ** 2;
				if (distance < bestDistance) {
					bestDistance = distance;
					best = index;
				}
			});
			return best;
		};

		const setHovered = (index: number) => {
			if (index === hoveredIndex.current) return;
			hoveredIndex.current = index;
			window.clearTimeout(hoverTimer.current);
			requestDraw();
			if (index < 0) {
				setHover(null);
				return;
			}
			const [screenX, screenY] = toScreen(data.fonts[index][0], data.fonts[index][1]);
			setHover({ index, left: screenX, top: screenY, isPreviewReady: false });
			// Fetch the font only once the pointer rests, so sweeping across the map loads nothing.
			hoverTimer.current = window.setTimeout(() => {
				loadFamily(data.fonts[index][3]).then((isReady) => {
					if (isReady && hoveredIndex.current === index) setHover((current) => (current ? { ...current, isPreviewReady: true } : current));
				});
			}, HOVER_LOAD_DELAY_MS);
		};

		const onPointerDown = (event: PointerEvent) => {
			setIsActive(true);
			velocity.current = { x: 0, y: 0 };
			drag.current = { x: event.clientX, y: event.clientY, time: performance.now(), distance: 0 };
			canvas.setPointerCapture(event.pointerId);
		};

		const onPointerMove = (event: PointerEvent) => {
			const box = canvas.getBoundingClientRect();
			if (drag.current) {
				const scale = size.current.base * camera.current.zoom;
				const moveX = (event.clientX - drag.current.x) / scale;
				const moveY = (event.clientY - drag.current.y) / (scale * ASPECT);
				camera.current.x = clamp(camera.current.x - moveX, 0, 1);
				camera.current.y = clamp(camera.current.y - moveY, 0, 1);
				velocity.current = isReducedMotion ? { x: 0, y: 0 } : { x: -moveX * 0.9, y: -moveY * 0.9 };
				drag.current = {
					x: event.clientX,
					y: event.clientY,
					time: performance.now(),
					distance: drag.current.distance + Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y),
				};
				setHovered(-1);
				requestDraw();
				return;
			}
			setHovered(nearest(event.clientX - box.left, event.clientY - box.top));
		};

		const onPointerUp = () => {
			const ended = drag.current;
			drag.current = null;
			if (ended && performance.now() - ended.time > 80) velocity.current = { x: 0, y: 0 };
			if (ended && ended.distance < 4 && hoveredIndex.current >= 0) onPick(data.fonts[hoveredIndex.current][4]);
			requestDraw();
		};

		const onWheel = (event: WheelEvent) => {
			if (document.activeElement !== canvas) return;
			event.preventDefault();
			velocity.current = { x: 0, y: 0 };
			const box = canvas.getBoundingClientRect();
			const pointerX = event.clientX - box.left;
			const pointerY = event.clientY - box.top;
			const scale = size.current.base * camera.current.zoom;
			// A trackpad scrolls in two axes, so it pans directly; a mouse wheel travels toward the pointer.
			const isTrackpad = event.deltaMode === 0 && (event.deltaX !== 0 || Math.abs(event.deltaY) < 40);
			if (event.ctrlKey) {
				zoomAt(pointerX, pointerY, Math.exp(-event.deltaY * 0.01));
			} else if (isTrackpad) {
				camera.current.x = clamp(camera.current.x + event.deltaX / scale, 0, 1);
				camera.current.y = clamp(camera.current.y + event.deltaY / (scale * ASPECT), 0, 1);
			} else {
				const directionX = pointerX - size.current.width / 2;
				const directionY = pointerY - size.current.height / 2;
				const length = Math.hypot(directionX, directionY) || 1;
				const distance = Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY), 120) * 0.45;
				camera.current.x = clamp(camera.current.x + ((directionX / length) * distance) / scale, 0, 1);
				camera.current.y = clamp(camera.current.y + ((directionY / length) * distance) / (scale * ASPECT), 0, 1);
			}
			setHovered(-1);
			requestDraw();
		};

		const onKeyDown = (event: KeyboardEvent) => {
			const step = 60 / (size.current.base * camera.current.zoom);
			const centreX = size.current.width / 2;
			const centreY = size.current.height / 2;
			const actions: Record<string, () => void> = {
				ArrowLeft: () => (camera.current.x = clamp(camera.current.x - step, 0, 1)),
				ArrowRight: () => (camera.current.x = clamp(camera.current.x + step, 0, 1)),
				ArrowUp: () => (camera.current.y = clamp(camera.current.y - step * 2, 0, 1)),
				ArrowDown: () => (camera.current.y = clamp(camera.current.y + step * 2, 0, 1)),
				'+': () => zoomAt(centreX, centreY, 1.25),
				'=': () => zoomAt(centreX, centreY, 1.25),
				'-': () => zoomAt(centreX, centreY, 0.8),
				'0': () => (camera.current = { x: 0.5, y: 0.5, zoom: 1 }),
				Escape: () => canvas.blur(),
			};
			const action = actions[event.key];
			if (!action) return;
			event.preventDefault();
			action();
			requestDraw();
		};

		const zoomButtons = (factor: number) => () => {
			zoomAt(size.current.width / 2, size.current.height / 2, factor);
			requestDraw();
		};
		const zoomIn = zoomButtons(1.4);
		const zoomOut = zoomButtons(1 / 1.4);
		canvas.parentElement?.querySelector('[data-zoom="in"]')?.addEventListener('click', zoomIn);
		canvas.parentElement?.querySelector('[data-zoom="out"]')?.addEventListener('click', zoomOut);

		const observer = new ResizeObserver(resize);
		observer.observe(canvas);
		canvas.addEventListener('pointerdown', onPointerDown);
		canvas.addEventListener('pointermove', onPointerMove);
		canvas.addEventListener('pointerup', onPointerUp);
		canvas.addEventListener('pointerleave', () => setHovered(-1));
		canvas.addEventListener('wheel', onWheel, { passive: false });
		canvas.addEventListener('keydown', onKeyDown);
		document.fonts.ready.then(requestDraw);
		resize();

		return () => {
			observer.disconnect();
			cancelAnimationFrame(frame.current);
			frame.current = 0;
			window.clearTimeout(hoverTimer.current);
			canvas.parentElement?.querySelector('[data-zoom="in"]')?.removeEventListener('click', zoomIn);
			canvas.parentElement?.querySelector('[data-zoom="out"]')?.removeEventListener('click', zoomOut);
			canvas.removeEventListener('pointerdown', onPointerDown);
			canvas.removeEventListener('pointermove', onPointerMove);
			canvas.removeEventListener('pointerup', onPointerUp);
			canvas.removeEventListener('wheel', onWheel);
			canvas.removeEventListener('keydown', onKeyDown);
		};
	}, [data, onPick, isReducedMotion]);

	const hovered = hover ? data.fonts[hover.index] : null;

	return (
		<div className="relative h-full w-full">
			<canvas
				ref={canvasRef}
				tabIndex={0}
				onFocus={() => setIsActive(true)}
				onBlur={() => setIsActive(false)}
				aria-label="Map of 1,910 fonts, grouped by how they look. Click or focus, then scroll, drag or use the arrow keys to move; plus and minus zoom; Escape returns the scroll to the page."
				className={`block h-full w-full touch-none focus-visible:outline-offset-[-4px] ${isActive ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
			/>
			{hovered && hover && (
				<div
					role="status"
					className="pointer-events-none absolute z-10 w-max max-w-[300px] rounded-[10px] border border-ink bg-paper px-4 py-3"
					style={{ left: Math.min(hover.left + 16, (size.current.width || 600) - 300), top: Math.max(hover.top - 76, 8) }}
				>
					<span className="block text-[30px] leading-[36px] whitespace-nowrap" style={hover.isPreviewReady ? { fontFamily: `"${hovered[3]}", serif` } : undefined}>
						{hovered[3]}
					</span>
					<span className="mt-1 flex items-center gap-2 caption text-secondary">
						<span className="h-[7px] w-[7px] rounded-full" style={{ background: data.regions[hovered[2]].colour }} aria-hidden="true" />
						{data.regions[hovered[2]].name}
					</span>
					<span className="mt-2 block text-[13px] font-medium text-ink">Click to search around it →</span>
				</div>
			)}
			{!isActive && (
				<p className="pointer-events-none absolute bottom-5 left-[68px] m-0 hidden h-10 items-center rounded-lg bg-ink px-4 text-[14px] whitespace-nowrap text-paper sm:flex">
					Click the map to explore · then scroll, drag or use the arrow keys
				</p>
			)}
			<div className="absolute bottom-5 left-5 flex flex-col gap-1.5" role="group" aria-label="Zoom">
				<button data-zoom="in" type="button" aria-label="Zoom in" className="h-9 w-9 cursor-pointer rounded-lg border border-line bg-paper text-[18px] font-medium hover:border-ink">
					+
				</button>
				<button data-zoom="out" type="button" aria-label="Zoom out" className="h-9 w-9 cursor-pointer rounded-lg border border-line bg-paper text-[18px] font-medium hover:border-ink">
					−
				</button>
			</div>
		</div>
	);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
