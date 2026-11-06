import { useEffect, useRef, useState } from 'react';
import { loadFamily } from '../lib/fontLoader';
import type { MapData } from '../hooks/useMapData';

const MIN_ZOOM = 0.8;
const MAX_ZOOM = 14;
const NAMES_FROM_ZOOM = 4.5;
const HOVER_RADIUS_SQUARED = 144;
const TAP_RADIUS_SQUARED = 784;
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
	isPinned: boolean;
}

/**
 * The whole index as an explorable map. Until it is clicked or focused, the page scrolls normally;
 * after that the scroll, drag and arrow keys move the map. It redraws only when something changes.
 */
export function MapExplorer({ data, onPick }: MapExplorerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const camera = useRef<Camera>({ x: 0.5, y: 0.5, zoom: 1 });
	const velocity = useRef({ x: 0, y: 0 });
	const size = useRef({ width: 0, height: 0, scaleX: 1, scaleY: 1 });
	const frame = useRef(0);
	const drag = useRef<{ x: number; y: number; time: number; distance: number } | null>(null);
	const touches = useRef(new Map<number, { x: number; y: number }>());
	const pinch = useRef<{ distance: number; x: number; y: number } | null>(null);
	const hoveredIndex = useRef(-1);
	const hoverTimer = useRef(0);
	const clearPick = useRef(() => {});
	const [isActive, setIsActive] = useState(false);
	const [hover, setHover] = useState<Hover | null>(null);
	const [hasTouched, setHasTouched] = useState(false);
	const isReducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context) return;

		const scaleX = () => size.current.scaleX * camera.current.zoom;
		const scaleY = () => size.current.scaleY * camera.current.zoom;

		const toScreen = (x: number, y: number) => [
			(x - camera.current.x) * scaleX() + size.current.width / 2,
			(y - camera.current.y) * scaleY() + size.current.height / 2,
		];

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
					const labelWidth = context.measureText(label).width + 22;
					const shift = clamp(screenX - 4, 4, Math.max(4, width - labelWidth - 4)) - (screenX - 4);
					const box = { left: screenX - 4 + shift, right: screenX + labelWidth - 4 + shift, top: screenY - 10, bottom: screenY + 10 };
					if (labelBoxes.some((other) => !(box.right < other.left || box.left > other.right || box.bottom < other.top || box.top > other.bottom))) continue;
					labelBoxes.push(box);
					context.fillStyle = 'rgba(238,240,236,0.9)';
					context.fillRect(box.left, box.top, box.right - box.left, 20);
					context.fillStyle = region.colour;
					context.beginPath();
					context.arc(box.left + 8, screenY, 3.5, 0, Math.PI * 2);
					context.fill();
					context.fillStyle = '#3B4740';
					context.fillText(label, box.left + 16, screenY + 4);
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
			const scaleX = Math.min(width * 0.92, height * 1.9);
			// The layout's proportions carry no meaning, so a portrait screen stretches it to fill the height.
			const scaleY = height > width ? Math.min(height * 0.86, scaleX * 1.7) : scaleX * ASPECT;
			size.current = { width, height, scaleX, scaleY };
			requestDraw();
		};

		const toMap = (screenX: number, screenY: number) => [
			(screenX - size.current.width / 2) / scaleX() + camera.current.x,
			(screenY - size.current.height / 2) / scaleY() + camera.current.y,
		];

		const panBy = (screenX: number, screenY: number) => {
			camera.current.x = clamp(camera.current.x + screenX / scaleX(), 0, 1);
			camera.current.y = clamp(camera.current.y + screenY / scaleY(), 0, 1);
		};

		const zoomAt = (screenX: number, screenY: number, factor: number) => {
			const [beforeX, beforeY] = toMap(screenX, screenY);
			camera.current.zoom = clamp(camera.current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
			const [afterX, afterY] = toMap(screenX, screenY);
			camera.current.x = clamp(camera.current.x + beforeX - afterX, 0, 1);
			camera.current.y = clamp(camera.current.y + beforeY - afterY, 0, 1);
		};

		const nearest = (screenX: number, screenY: number, radiusSquared: number) => {
			let best = -1;
			let bestDistance = radiusSquared;
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

		const setHovered = (index: number, isPinned = false) => {
			if (index === hoveredIndex.current) return;
			hoveredIndex.current = index;
			window.clearTimeout(hoverTimer.current);
			requestDraw();
			if (index < 0) {
				setHover(null);
				return;
			}
			const [screenX, screenY] = toScreen(data.fonts[index][0], data.fonts[index][1]);
			setHover({ index, left: screenX, top: screenY, isPreviewReady: false, isPinned });
			// Fetch the font only once the pointer rests, so sweeping across the map loads nothing.
			hoverTimer.current = window.setTimeout(() => {
				loadFamily(data.fonts[index][3]).then((isReady) => {
					if (isReady && hoveredIndex.current === index) setHover((current) => (current ? { ...current, isPreviewReady: true } : current));
				});
			}, HOVER_LOAD_DELAY_MS);
		};

		const touchMidpoint = () => {
			const [first, second] = [...touches.current.values()];
			return { distance: Math.hypot(first.x - second.x, first.y - second.y), x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
		};

		const onPointerDown = (event: PointerEvent) => {
			setIsActive(true);
			velocity.current = { x: 0, y: 0 };
			canvas.setPointerCapture(event.pointerId);
			if (event.pointerType === 'touch') {
				setHasTouched(true);
				touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
				if (touches.current.size === 2) {
					drag.current = null;
					pinch.current = touchMidpoint();
					setHovered(-1);
					return;
				}
			}
			drag.current = { x: event.clientX, y: event.clientY, time: performance.now(), distance: 0 };
		};

		const onPinchMove = () => {
			const box = canvas.getBoundingClientRect();
			const next = touchMidpoint();
			const previous = pinch.current ?? next;
			panBy(previous.x - next.x, previous.y - next.y);
			zoomAt(next.x - box.left, next.y - box.top, next.distance / (previous.distance || next.distance));
			pinch.current = next;
			requestDraw();
		};

		const onPointerMove = (event: PointerEvent) => {
			const box = canvas.getBoundingClientRect();
			if (touches.current.has(event.pointerId)) {
				touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
				if (touches.current.size === 2) return onPinchMove();
			}
			if (drag.current) {
				const moveX = event.clientX - drag.current.x;
				const moveY = event.clientY - drag.current.y;
				panBy(-moveX, -moveY);
				velocity.current = isReducedMotion ? { x: 0, y: 0 } : { x: (-moveX / scaleX()) * 0.9, y: (-moveY / scaleY()) * 0.9 };
				drag.current = {
					x: event.clientX,
					y: event.clientY,
					time: performance.now(),
					distance: drag.current.distance + Math.hypot(moveX, moveY),
				};
				if (drag.current.distance >= 8) setHovered(-1);
				requestDraw();
				return;
			}
			if (event.pointerType === 'mouse') setHovered(nearest(event.clientX - box.left, event.clientY - box.top, HOVER_RADIUS_SQUARED));
		};

		const onPointerUp = (event: PointerEvent) => {
			const ended = drag.current;
			drag.current = null;
			const wasPinching = pinch.current !== null;
			touches.current.delete(event.pointerId);
			if (touches.current.size < 2) pinch.current = null;
			if (ended && performance.now() - ended.time > 80) velocity.current = { x: 0, y: 0 };
			const isTap = ended !== null && !wasPinching && ended.distance < 8;
			if (isTap && event.pointerType === 'touch') {
				// A finger has no hover, so a tap shows the font's card; its button does the search.
				const box = canvas.getBoundingClientRect();
				setHovered(nearest(event.clientX - box.left, event.clientY - box.top, TAP_RADIUS_SQUARED), true);
			} else if (isTap && hoveredIndex.current >= 0) {
				onPick(data.fonts[hoveredIndex.current][4]);
			}
			requestDraw();
		};

		clearPick.current = () => setHovered(-1);

		const onPointerLeave = (event: PointerEvent) => {
			if (event.pointerType === 'mouse') setHovered(-1);
		};

		const onWheel = (event: WheelEvent) => {
			if (document.activeElement !== canvas) return;
			event.preventDefault();
			velocity.current = { x: 0, y: 0 };
			const box = canvas.getBoundingClientRect();
			const pointerX = event.clientX - box.left;
			const pointerY = event.clientY - box.top;
			// A trackpad scrolls in two axes, so it pans directly; a mouse wheel travels toward the pointer.
			const isTrackpad = event.deltaMode === 0 && (event.deltaX !== 0 || Math.abs(event.deltaY) < 40);
			if (event.ctrlKey) {
				zoomAt(pointerX, pointerY, Math.exp(-event.deltaY * 0.01));
			} else if (isTrackpad) {
				panBy(event.deltaX, event.deltaY);
			} else {
				const directionX = pointerX - size.current.width / 2;
				const directionY = pointerY - size.current.height / 2;
				const length = Math.hypot(directionX, directionY) || 1;
				const distance = Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY), 120) * 0.45;
				panBy((directionX / length) * distance, (directionY / length) * distance);
			}
			setHovered(-1);
			requestDraw();
		};

		const onKeyDown = (event: KeyboardEvent) => {
			const centreX = size.current.width / 2;
			const centreY = size.current.height / 2;
			const actions: Record<string, () => void> = {
				ArrowLeft: () => panBy(-60, 0),
				ArrowRight: () => panBy(60, 0),
				ArrowUp: () => panBy(0, -60),
				ArrowDown: () => panBy(0, 60),
				'+': () => zoomAt(centreX, centreY, 1.25),
				'=': () => zoomAt(centreX, centreY, 1.25),
				'-': () => zoomAt(centreX, centreY, 0.8),
				'0': () => (camera.current = { x: 0.5, y: 0.5, zoom: 1 }),
				Escape: () => {
					setHovered(-1);
					canvas.blur();
				},
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
		canvas.addEventListener('pointercancel', onPointerUp);
		canvas.addEventListener('pointerleave', onPointerLeave);
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
			canvas.removeEventListener('pointercancel', onPointerUp);
			canvas.removeEventListener('pointerleave', onPointerLeave);
			canvas.removeEventListener('wheel', onWheel);
			canvas.removeEventListener('keydown', onKeyDown);
		};
	}, [data, onPick, isReducedMotion]);

	const hovered = hover ? data.fonts[hover.index] : null;
	const previewStyle = hovered && hover?.isPreviewReady ? { fontFamily: `"${hovered[3]}", serif` } : undefined;
	const zoomButtonClasses = 'h-10 w-10 cursor-pointer rounded-lg border border-line bg-paper text-[18px] font-medium hover:border-ink sm:h-9 sm:w-9';

	return (
		<div className="relative h-full w-full">
			<canvas
				ref={canvasRef}
				tabIndex={0}
				onFocus={() => setIsActive(true)}
				onBlur={() => setIsActive(false)}
				aria-label="Map of 1,910 fonts, grouped by how they look. Click or focus, then scroll, drag or use the arrow keys to move; plus and minus zoom; Escape returns the scroll to the page. On a touch screen, drag to move, pinch to zoom and tap a dot."
				className={`block h-full w-full touch-none focus-visible:outline-offset-[-4px] ${isActive ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
			/>
			{hovered && hover && !hover.isPinned && (
				<div
					role="status"
					className="pointer-events-none absolute z-10 w-max max-w-[300px] rounded-[10px] border border-ink bg-paper px-4 py-3"
					style={{ left: Math.max(8, Math.min(hover.left + 16, (size.current.width || 600) - 300)), top: Math.max(hover.top - 76, 8) }}
				>
					<span className="block text-[30px] leading-[36px] whitespace-nowrap" style={previewStyle}>
						{hovered[3]}
					</span>
					<span className="mt-1 flex items-center gap-2 caption text-secondary">
						<span className="h-[7px] w-[7px] rounded-full" style={{ background: data.regions[hovered[2]].colour }} aria-hidden="true" />
						{data.regions[hovered[2]].name}
					</span>
					<span className="mt-2 block text-[13px] font-medium text-ink">Click to search around it →</span>
				</div>
			)}
			{hovered && hover?.isPinned && (
				<div role="status" className="absolute inset-x-3 bottom-3 z-10 rounded-xl border border-ink bg-paper p-4 animate-fade-in">
					<div className="flex items-start gap-3">
						<div className="min-w-0 flex-1">
							<span className="block truncate text-[28px] leading-[34px]" style={previewStyle}>
								{hovered[3]}
							</span>
							<span className="mt-1 flex items-center gap-2 caption text-secondary">
								<span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: data.regions[hovered[2]].colour }} aria-hidden="true" />
								{data.regions[hovered[2]].name}
							</span>
						</div>
						<button
							type="button"
							aria-label="Close"
							onClick={() => clearPick.current()}
							className="-mt-1 -mr-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-[20px] text-muted hover:bg-tint hover:text-ink"
						>
							×
						</button>
					</div>
					<button
						type="button"
						onClick={() => onPick(hovered[4])}
						className="mt-3 flex h-11 w-full cursor-pointer items-center justify-center rounded-lg border-0 bg-ink text-[15px] font-medium text-paper active:bg-black"
					>
						Search around it →
					</button>
				</div>
			)}
			{!isActive && (
				<p className="pointer-events-none absolute bottom-5 left-[68px] m-0 hidden h-10 items-center rounded-lg bg-ink px-4 text-[14px] whitespace-nowrap text-paper sm:flex">
					Click the map to explore · then scroll, drag or use the arrow keys
				</p>
			)}
			{!hasTouched && (
				<p className="pointer-events-none absolute top-3 left-3 m-0 flex h-8 items-center rounded-lg bg-ink px-3 text-[13px] whitespace-nowrap text-paper sm:hidden">
					Drag to move · pinch to zoom · tap a dot
				</p>
			)}
			<div className="absolute top-3 right-3 flex flex-col gap-1.5 sm:top-auto sm:right-auto sm:bottom-5 sm:left-5" role="group" aria-label="Zoom">
				<button data-zoom="in" type="button" aria-label="Zoom in" className={zoomButtonClasses}>
					+
				</button>
				<button data-zoom="out" type="button" aria-label="Zoom out" className={zoomButtonClasses}>
					−
				</button>
			</div>
		</div>
	);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
