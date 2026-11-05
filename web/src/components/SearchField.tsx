import { useCallback, useEffect, useRef, useState } from 'react';
import type { SearchInput } from '../api/types';
import {
	ArrowRightIcon,
	MagnifyingGlassIcon,
	UploadIcon,
	WarningIcon,
	XIcon,
} from './icons';

interface SearchFieldProps {
	onSearch: (input: SearchInput) => void;
	disabled?: boolean;
}

export function SearchField({ onSearch, disabled }: SearchFieldProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState('');
	const [isDragging, setIsDragging] = useState(false);
	const [file, setFile] = useState<{
		previewUrl: string;
		name: string;
		raw: File;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		return () => {
			if (file) URL.revokeObjectURL(file.previewUrl);
		};
	}, [file]);

	const acceptFile = useCallback(
		(candidate: File | undefined) => {
			if (disabled || !candidate) return;

			// Some browsers report an empty MIME type for .heic/.heif (iPhone's default photo
			// format), so fall back to checking the extension when the type is blank.
			const looksLikeImage =
				candidate.type.startsWith('image/') ||
				(candidate.type === '' && /\.(heic|heif)$/i.test(candidate.name));
			if (!looksLikeImage) {
				setError('Please upload an image file.');
				return;
			}

			setError(null);
			setQuery('');
			setFile((current) => {
				if (current) URL.revokeObjectURL(current.previewUrl);
				return {
					previewUrl: URL.createObjectURL(candidate),
					name: candidate.name,
					raw: candidate,
				};
			});
		},
		[disabled]
	);

	const clearFile = () => {
		setFile((current) => {
			if (current) URL.revokeObjectURL(current.previewUrl);
			return null;
		});
		setError(null);
		inputRef.current?.focus();
	};

	const hasFile = file !== null;
	const hasQuery = query.trim().length > 0;

	const submit = () => {
		if (disabled) return;
		if (file) {
			onSearch({ mode: 'image', file: file.raw });
			return;
		}
		const trimmed = query.trim();
		if (!trimmed) return;
		onSearch({ mode: 'text', query: trimmed });
	};

	return (
		<div className="relative w-full">
			<div
				className={`group flex h-12 items-center gap-3 rounded-[10px] border bg-paper pr-[6px] pl-[14px] transition-colors duration-[120ms] focus-within:border-ink ${
					isDragging ? 'border-accent bg-tint' : 'border-line'
				} ${disabled ? 'opacity-60' : ''}`}
				onDragOver={(event) => {
					event.preventDefault();
					if (!disabled) setIsDragging(true);
				}}
				onDragLeave={() => setIsDragging(false)}
				onDrop={(event) => {
					event.preventDefault();
					setIsDragging(false);
					acceptFile(event.dataTransfer.files?.[0]);
				}}
			>
				<MagnifyingGlassIcon
					size={18}
					className="shrink-0 text-muted group-focus-within:text-ink"
				/>

				{hasFile ? (
					<div className="flex min-w-0 flex-1 items-center gap-[0.6rem]">
						<span
							className="group/thumb relative flex shrink-0 rounded"
							tabIndex={0}
						>
							<img
								src={file.previewUrl}
								alt=""
								className="h-8 w-8 shrink-0 rounded border border-rule object-cover"
							/>
							<img
								src={file.previewUrl}
								alt={`Preview of ${file.name}`}
								className="pointer-events-none invisible absolute top-[calc(100%+10px)] left-0 z-20 h-auto w-60 max-w-[60vw] rounded-[10px] border border-ink bg-paper object-contain opacity-0 transition-opacity duration-[120ms] group-hover/thumb:visible group-hover/thumb:opacity-100 group-focus-visible/thumb:visible group-focus-visible/thumb:opacity-100"
							/>
						</span>
						<span className="min-w-0 truncate text-[15px] text-ink">
							{file.name}
						</span>
						<button
							type="button"
							className="ml-auto flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-muted hover:bg-tint hover:text-ink"
							onClick={clearFile}
							aria-label="Remove image and search by text instead"
						>
							<XIcon size={16} />
						</button>
					</div>
				) : (
					<input
						ref={inputRef}
						type="text"
						className="min-w-0 flex-1 border-0 bg-transparent font-sans text-[16px] text-ink placeholder:text-muted focus:outline-none disabled:cursor-default"
						aria-label="Describe a font"
						placeholder="Describe a style, or drop a photo"
						value={query}
						disabled={disabled}
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter') submit();
						}}
					/>
				)}

				<button
					type="button"
					className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-ink text-paper transition-colors duration-[120ms] enabled:hover:bg-[#2A3631] enabled:active:bg-black disabled:cursor-default disabled:opacity-40"
					onClick={
						hasFile || hasQuery ? submit : () => fileInputRef.current?.click()
					}
					disabled={disabled}
					aria-label={hasFile || hasQuery ? 'Search' : 'Upload an image'}
				>
					{hasFile || hasQuery ? (
						<ArrowRightIcon size={18} />
					) : (
						<UploadIcon size={18} />
					)}
				</button>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*,.heic,.heif"
					hidden
					disabled={disabled}
					onChange={(event) => {
						acceptFile(event.target.files?.[0]);
						event.target.value = '';
					}}
				/>
			</div>

			<p
				className="absolute top-full left-0 mt-1 px-1 text-[13px] leading-[18px] text-muted"
				aria-live="polite"
			>
				{error ? (
					<span className="inline-flex items-center gap-[0.35rem] text-error">
						<WarningIcon size={14} /> {error}
					</span>
				) : hasFile ? (
					'Photo attached. Press search to find its lettering, or remove it to type instead.'
				) : (
					''
				)}
			</p>
		</div>
	);
}
