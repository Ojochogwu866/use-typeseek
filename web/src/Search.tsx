import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { getFont, getNeighbors, searchByImage, searchByText } from './api/client';
import type { FontResult, RegionResult, SearchInput } from './api/types';
import { AccountButton } from './components/account/AccountButton';
import { FontDrawer } from './components/FontDrawer';
import { LicenseFilter } from './components/LicenseFilter';
import { Logo } from './components/Logo';
import { ResultsMap } from './components/ResultsMap';
import { SearchField } from './components/SearchField';
import { SpecimenStrip } from './components/SpecimenStrip';
import { TrailBar } from './components/TrailBar';
import { useDelayedFlag } from './hooks/useDelayedFlag';
import { useDelayedUnmount } from './hooks/useDelayedUnmount';
import { useAccount } from './contexts/accountContext';
import { useToast } from './contexts/toastContext';
import { useAuth } from './hooks/useAuth';
import { usePreferences } from './hooks/usePreferences';
import { useSaved } from './hooks/useSaved';
import { PageMeta } from './components/PageMeta';

const COLD_START_HINT_DELAY_MS = 2500;
// Must match the drawer-out animation in index.css.
const DRAWER_EXIT_MS = 200;

function runSearch(input: SearchInput, license: string): Promise<RegionResult[]> {
	if (input.mode === 'image') return searchByImage(input.file, license);
	return searchByText(input.query, license).then((results) => [{ results }]);
}

function describeInput(input: SearchInput | null): string {
	if (!input) return 'From the map';
	return input.mode === 'text' ? `“${input.query}”` : 'Your photo';
}

function inputKey(input: SearchInput | null): string {
	if (!input) return '';
	return input.mode === 'text' ? `text:${input.query}` : `image:${input.file.name}:${input.file.size}:${input.file.lastModified}`;
}

function initialInput(params: URLSearchParams, state: unknown): SearchInput | null {
	const query = params.get('q');
	if (query) return { mode: 'text', query };
	return (state as { input?: SearchInput } | null)?.input ?? null;
}

function SkeletonStrips() {
	return (
		<ul className="m-0 list-none p-0" aria-hidden="true">
			{Array.from({ length: 5 }, (_, index) => (
				<li key={index} className="border-b border-rule px-[18px] pt-[32px] pb-[16px]">
					<span className="block h-10 rounded bg-[#F2F3F1]" style={{ width: `${70 - index * 6}%` }} />
					<span className="mt-[18px] block h-3 w-56 rounded bg-[#F2F3F1]" />
				</li>
			))}
		</ul>
	);
}

function Notice({ tone = 'info', children }: { tone?: 'info' | 'error'; children: ReactNode }) {
	const colours = tone === 'error' ? 'bg-error-tint text-error-ink' : 'bg-ground text-ink';
	return (
		<div role={tone === 'error' ? 'alert' : 'status'} className={`mt-6 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-[14px] leading-5 ${colours}`}>
			{children}
		</div>
	);
}

/** While a photo is read: the photo itself, with crop marks closing in on the lettering. */
function PhotoReading({ file }: { file: File }) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		const objectUrl = URL.createObjectURL(file);
		setUrl(objectUrl);
		return () => URL.revokeObjectURL(objectUrl);
	}, [file]);
	const corner = 'absolute h-6 w-6 border-accent';
	return (
		<div className="mt-6 flex flex-col items-start gap-3" role="status">
			<div className="relative overflow-hidden rounded-lg bg-ground">
				{url && <img src={url} alt="Your photo" className="block max-h-[260px] max-w-full object-contain" />}
				<div className="absolute inset-6 animate-crop motion-reduce:animate-none" aria-hidden="true">
					<span className={`${corner} top-0 left-0 border-t-2 border-l-2`} />
					<span className={`${corner} top-0 right-0 border-t-2 border-r-2`} />
					<span className={`${corner} bottom-0 left-0 border-b-2 border-l-2`} />
					<span className={`${corner} right-0 bottom-0 border-r-2 border-b-2`} />
				</div>
			</div>
			<p className="m-0 text-[14px] text-secondary">Reading the lettering in your photo…</p>
		</div>
	);
}

function Search() {
	const [searchParams] = useSearchParams();
	const location = useLocation();
	const { user } = useAuth();
	const { requestSignIn } = useAccount();
	const showToast = useToast();
	const { preferences, update: updatePreferences } = usePreferences();
	const { savedIds, save, remove } = useSaved();
	const [licenseChoice, setLicense] = useState<string | null>(null);
	const license = licenseChoice ?? preferences.license;
	const [originOverride, setOriginOverride] = useState<string | null>(null);
	const [lastInput, setLastInput] = useState<SearchInput | null>(() => initialInput(searchParams, location.state));
	const [trail, setTrail] = useState<FontResult[]>([]);
	const [openFont, setOpenFont] = useState<FontResult | null>(null);
	const [expandedRegion, setExpandedRegion] = useState(0);
	const previewWords = preferences.preview_words;
	const setPreviewWords = (words: string) => {
		if (words.trim() === previewWords) return;
		updatePreferences({ preview_words: words }).catch((error: Error) => showToast({ tone: 'error', message: `Couldn’t save your preview words. ${error.message}` }));
	};
	const [draftWords, setDraftWords] = useState(previewWords);
	useEffect(() => setDraftWords(previewWords), [previewWords]);
	const lastOpenFont = useRef<FontResult | null>(null);
	const opener = useRef<HTMLElement | null>(null);
	if (openFont) lastOpenFont.current = openFont;

	// A query keyed by what was searched, so results survive remounts and the licence filter refetches on its own.
	const searchQuery = useQuery({
		queryKey: ['search', inputKey(lastInput), license],
		queryFn: () => runSearch(lastInput!, license),
		enabled: lastInput !== null,
		retry: false,
		staleTime: Infinity,
	});
	const isSearching = searchQuery.isFetching;
	const isColdStart = useDelayedFlag(isSearching, COLD_START_HINT_DELAY_MS);
	const currentHop = trail.at(-1) ?? null;
	const neighborsQuery = useQuery({
		queryKey: ['neighbors', currentHop?.id],
		queryFn: () => getNeighbors(currentHop!.id),
		enabled: currentHop !== null,
	});

	const regions = searchQuery.data ?? [];
	const searchResults = regions[expandedRegion]?.results ?? [];
	const hopResults = (neighborsQuery.data ?? []).filter((font) => !license || font.license === license);
	const results = currentHop ? hopResults : searchResults;
	const isLoading = (!currentHop && isSearching) || (currentHop !== null && neighborsQuery.isPending);
	const isDrawerOpen = openFont !== null;
	const shouldRenderDrawer = useDelayedUnmount(isDrawerOpen, DRAWER_EXIT_MS);

	const startSearch = (input: SearchInput) => {
		setTrail([]);
		setOpenFont(null);
		setExpandedRegion(0);
		setOriginOverride(null);
		setLastInput(input);
	};

	const fromIds = searchParams.get('trail') ?? searchParams.get('from') ?? '';
	const fromOrigin = searchParams.get('origin');
	useEffect(() => {
		// Arriving from a font picked on the map, a saved font, or a saved trail: start as hops from those fonts.
		const ids = fromIds.split(',').map(Number).filter((id) => id > 0);
		if (ids.length === 0) return;
		let isCurrent = true;
		Promise.all(ids.map(getFont))
			.then((fonts) => {
				if (!isCurrent) return;
				setTrail(fonts);
				setOriginOverride(fromOrigin);
			})
			.catch((error: Error) => showToast({ tone: 'error', message: `Couldn’t open that font. ${error.message}` }));
		return () => {
			isCurrent = false;
		};
	}, [fromIds, fromOrigin, showToast]);

	const origin = originOverride ?? describeInput(lastInput);

	const saveFont = (font: FontResult) => {
		const walked = trail.map((step) => step.id);
		const steps = walked.at(-1) === font.id ? walked : [...walked, font.id];
		const foundWith = trail.length > 0 ? 'a trail' : lastInput?.mode === 'image' ? 'a photo' : origin;
		save.mutate(
			{ font_id: font.id, found_with: foundWith, trail: trail.length > 0 ? { origin, font_ids: steps } : undefined },
			{
				onSuccess: () =>
					showToast({ tone: 'success', message: `Saved ${font.name}`, action: { label: 'Undo', onClick: () => remove.mutate(font.id) } }),
				onError: (error: Error) =>
					showToast({ tone: 'error', message: `Couldn’t save ${font.name}. ${error.message}`, action: { label: 'Retry', onClick: () => saveFont(font) } }),
			}
		);
	};

	const requestSave = (font: FontResult) => {
		if (user) saveFont(font);
		// Signing in happens at the moment it's needed, and the save finishes itself afterwards.
		else requestSignIn(`Keep ${font.name} for later`, () => saveFont(font));
	};

	const openDetails = (id: number) => {
		opener.current = document.activeElement as HTMLElement | null;
		setOpenFont(results.find((font) => font.id === id) ?? null);
	};

	const closeDetails = useCallback(() => {
		setOpenFont(null);
		opener.current?.focus();
	}, []);

	const hopTo = (font: FontResult) => {
		setOpenFont(null);
		setTrail((steps) => [...steps, font]);
	};

	const openIndex = lastOpenFont.current ? results.findIndex((font) => font.id === lastOpenFont.current!.id) : -1;
	const position = `${String(openIndex + 1).padStart(2, '0')} of ${results.length} · ${origin}`;
	const heading = currentHop ? `${results.length} nearest ${currentHop.name}` : `${results.length} closest`;
	const secondaryRegions = regions.map((region, index) => ({ region, index })).filter(({ region, index }) => index > 0 && region.results.length > 0);

	return (
		<div className="flex min-h-screen flex-col bg-paper">
			<PageMeta title={lastInput?.mode === 'text' ? `Fonts like ${origin}` : lastInput ? 'Fonts like your photo' : 'Search'} />
			<header className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-rule px-4 py-3 sm:px-8 lg:h-[72px] lg:flex-nowrap lg:py-0">
				<Link to="/" className="no-underline" aria-label="typeseek home">
					<Logo hasName={false} size={24} />
				</Link>
				<div className="order-3 w-full lg:order-none lg:w-[560px]">
					<SearchField onSearch={startSearch} disabled={isSearching} />
				</div>
				<div className="ml-auto flex items-center gap-4">
					<div className="hidden sm:block">
						<LicenseFilter value={license} onChange={setLicense} disabled={isSearching} />
					</div>
					<AccountButton />
				</div>
				<div className="order-4 sm:hidden">
					<LicenseFilter value={license} onChange={setLicense} disabled={isSearching} />
				</div>
			</header>

			{lastInput === null && trail.length === 0 && (
				<main className="mx-auto w-full max-w-[720px] px-4 py-20 text-center">
					<h1 className="m-0 text-[28px] leading-9 font-semibold tracking-[-0.02em]">Describe it, or show it</h1>
					<p className="mx-auto mt-3 max-w-[520px] text-[16px] leading-[23px] tracking-[-0.01em] text-secondary">
						Type a few words like “elegant thin serif”, or drop a photo of lettering you saw. You’ll see the closest fonts, set in your own words.
					</p>
				</main>
			)}

			{(lastInput !== null || trail.length > 0) && (
				<main className={`mx-auto grid w-full max-w-[1440px] grid-cols-1 gap-10 px-4 pt-6 pb-16 sm:px-8 sm:pt-8 ${preferences.is_map_shown ? 'lg:grid-cols-[440px_minmax(0,1fr)]' : ''}`}>
					<aside className={preferences.is_map_shown ? 'hidden lg:block' : 'hidden'}>
						{results.length > 0 && (
							<div className="sticky top-8">
								<ResultsMap results={results} trail={trail.map((font) => font.name)} selectedName={openFont?.name ?? null} />
								<div className="mt-6 border-t border-rule pt-4">
									<p className="m-0 caption text-secondary">Trail</p>
									<p className="mt-2 mb-0 text-[15px]">
										<span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent" aria-hidden="true" />
										{origin}
										{trail.map((font) => ` → ${font.name}`).join('')}
									</p>
									{trail.length === 0 && (
										<p className="mt-2 mb-0 text-[13px] leading-[18px] text-muted">
											Use “More like this” on any font to walk to its neighbours. Each step is kept here.
										</p>
									)}
								</div>
							</div>
						)}
					</aside>

					<section aria-label="Results" aria-busy={isLoading} className="min-w-0">
						{results.length > 0 && preferences.is_map_shown && (
							<div className="mb-5 lg:hidden">
								<ResultsMap isCompact results={results} trail={trail.map((font) => font.name)} selectedName={openFont?.name ?? null} />
							</div>
						)}
						{trail.length > 0 && (
							<TrailBar origin={origin} steps={trail.map((font) => font.name)} onBack={() => setTrail((steps) => steps.slice(0, -1))} />
						)}

						<div className={`flex flex-wrap items-center justify-between gap-3 pb-3 ${trail.length ? 'pt-3' : 'border-b-[1.5px] border-ink'}`}>
							<span className="caption text-secondary">{isLoading ? 'Searching' : heading}</span>
							<form
								className="hidden items-center gap-2 sm:flex"
								onSubmit={(event) => {
									event.preventDefault();
									setPreviewWords(draftWords);
								}}
							>
								<label htmlFor="preview-words" className="caption text-secondary">
									Preview
								</label>
								<input
									id="preview-words"
									value={draftWords}
									onChange={(event) => setDraftWords(event.target.value)}
									onBlur={() => setPreviewWords(draftWords)}
									className="h-8 w-[200px] rounded-[7px] border border-line bg-paper px-[9px] text-[13px] text-ink focus:border-ink focus:outline-none"
								/>
							</form>
						</div>

						{isLoading && (
							<>
								{isColdStart && <Notice>The first search wakes the model, so it takes a few seconds. The next ones are quick.</Notice>}
								{!currentHop && lastInput?.mode === 'image' ? <PhotoReading file={lastInput.file} /> : <SkeletonStrips />}
							</>
						)}

						{searchQuery.isError && !currentHop && (
							<Notice tone="error">
								<span>{searchQuery.error.message} Your search is kept.</span>
								<button
									type="button"
									onClick={() => searchQuery.refetch()}
									className="h-8 cursor-pointer rounded-[7px] border border-error bg-paper px-3 text-[13px] font-medium text-error-ink"
								>
									Try again
								</button>
							</Notice>
						)}

						{currentHop && neighborsQuery.isError && <Notice tone="error">Couldn’t load fonts near {currentHop.name}. Go back a step or try again.</Notice>}

						{!isLoading && (currentHop ? neighborsQuery.isSuccess : searchQuery.isSuccess) && results.length === 0 && (
							<Notice>No close match. Try describing it differently, for example by weight or shape, or upload a photo.</Notice>
						)}

						{!isLoading && results.length > 0 && (
							<ol className="m-0 list-none p-0">
								{results.map((font, index) => (
									<SpecimenStrip
										key={font.id}
										font={font}
										rank={index + 1}
										previewWords={previewWords}
										isSelected={openFont?.id === font.id}
										onOpen={openDetails}
										onMoreLikeThis={hopTo}
									/>
								))}
							</ol>
						)}

						{!currentHop && secondaryRegions.length > 0 && (
							<div className="mt-10">
								<p className="m-0 caption text-secondary">Other lettering in this photo</p>
								<div className="mt-3 flex flex-wrap gap-3">
									{[{ region: regions[0], index: 0 }, ...secondaryRegions].map(({ region, index }) => (
										<button
											key={index}
											type="button"
											aria-pressed={expandedRegion === index}
											onClick={() => setExpandedRegion(index)}
											className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border bg-paper p-1.5 ${expandedRegion === index ? 'border-ink' : 'border-line hover:border-ink'}`}
										>
											{region.thumbnail && <img src={`data:image/jpeg;base64,${region.thumbnail}`} alt="" className="h-16 w-16 rounded object-cover" />}
											<span className="max-w-16 truncate text-[12px] text-secondary">{region.results[0]?.name ?? 'Unknown'}</span>
										</button>
									))}
								</div>
							</div>
						)}
					</section>
				</main>
			)}

			{shouldRenderDrawer && lastOpenFont.current && (
				<FontDrawer
					font={lastOpenFont.current}
					position={position}
					previewWords={previewWords}
					isClosing={!isDrawerOpen}
					isSaved={savedIds.has(lastOpenFont.current.id)}
					isSaving={save.isPending}
					onSave={requestSave}
					onClose={closeDetails}
					onMoreLikeThis={hopTo}
				/>
			)}
		</div>
	);
}

export default Search;
