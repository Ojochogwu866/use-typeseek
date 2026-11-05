import { useEffect, useRef } from 'react';
import { useMapData } from '../hooks/useMapData';

/** A small piece of the map with a saved trail drawn on it. */
export function TrailThumbnail({ names }: { names: string[] }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const { data } = useMapData();
	const namesKey = names.join('|');

	useEffect(() => {
		const canvas = canvasRef.current;
		const context = canvas?.getContext('2d');
		if (!canvas || !context || !data) return;
		const ratio = devicePixelRatio || 1;
		const { clientWidth: width, clientHeight: height } = canvas;
		canvas.width = width * ratio;
		canvas.height = height * ratio;
		context.setTransform(ratio, 0, 0, ratio, 0, 0);
		const steps = namesKey.split('|').map((name) => data.indexByName.get(name)).filter((index) => index !== undefined);
		if (steps.length === 0) return;
		const xs = steps.map((index) => data.fonts[index][0]);
		const ys = steps.map((index) => data.fonts[index][1]);
		const span = Math.max(0.1, Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) * 2.4);
		const centreX = (Math.max(...xs) + Math.min(...xs)) / 2;
		const centreY = (Math.max(...ys) + Math.min(...ys)) / 2;
		const scale = (width * 0.7) / span;
		const place = (index: number) => [(data.fonts[index][0] - centreX) * scale + width / 2, (data.fonts[index][1] - centreY) * scale * 0.5 + height / 2];

		context.clearRect(0, 0, width, height);
		context.fillStyle = '#16201B';
		context.globalAlpha = 0.3;
		data.fonts.forEach((_, index) => {
			const [x, y] = place(index);
			if (x < 0 || x > width || y < 0 || y > height) return;
			context.beginPath();
			context.arc(x, y, 1.8, 0, Math.PI * 2);
			context.fill();
		});
		context.globalAlpha = 1;
		context.strokeStyle = '#0F6B46';
		context.fillStyle = '#0F6B46';
		context.lineWidth = 2;
		context.beginPath();
		steps.forEach((index, position) => {
			const [x, y] = place(index);
			if (position === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		});
		context.stroke();
		steps.forEach((index, position) => {
			const [x, y] = place(index);
			context.beginPath();
			context.arc(x, y, position === steps.length - 1 ? 6 : 4, 0, Math.PI * 2);
			context.fill();
		});
	}, [data, namesKey]);

	return <canvas ref={canvasRef} className="block h-[150px] w-full rounded-[10px] bg-ground" aria-hidden="true" />;
}
