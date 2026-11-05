import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { SavedFont, Trail } from '../api/account';
import type { SearchInput } from '../api/types';
import { AccountButton } from '../components/account/AccountButton';
import { useAccount } from '../contexts/accountContext';
import { Logo } from '../components/Logo';
import { SearchField } from '../components/SearchField';
import { useToast } from '../contexts/toastContext';
import { TrailThumbnail } from '../components/TrailThumbnail';
import { useAuth } from '../hooks/useAuth';
import { useFontStatus } from '../hooks/useFontStatus';
import { useIsNearView } from '../hooks/useIsNearView';
import { usePreferences } from '../hooks/usePreferences';
import { useSaved } from '../hooks/useSaved';
import { licenceLabel } from '../lib/licence';
import { trailLink } from '../lib/trailLink';

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

function SavedStrip({ item, previewWords, onRemove }: { item: SavedFont; previewWords: string; onRemove: (item: SavedFont) => void }) {
	const stripRef = useRef<HTMLLIElement>(null);
	const isNearView = useIsNearView(stripRef);
	const status = useFontStatus(item.font.name, isNearView);
	const linkClass = 'inline-flex min-h-8 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 caption text-ink underline underline-offset-[3px] hover:decoration-2';
	return (
		<li ref={stripRef} className="flex flex-col gap-[6px] border-b border-rule py-[22px] pb-[18px]">
			<span className="block h-[46px] overflow-hidden sm:h-[66px]">
				{status === 'ready' ? (
					<span className="block animate-fade-in truncate text-[38px] leading-[46px] sm:text-[56px] sm:leading-[66px]" style={{ fontFamily: `"${item.font.name}", serif` }}>
						{previewWords}
					</span>
				) : status === 'failed' ? (
					<span className="block pt-3 text-[15px] text-muted">Preview didn’t load</span>
				) : (
					<span className="block h-[30px] w-3/5 translate-y-[10px] rounded bg-[#F2F3F1]" />
				)}
			</span>
			<div className="flex flex-wrap items-center gap-x-[18px] gap-y-1 caption text-secondary">
				<span>{item.font.name}</span>
				<span className="text-accent">{licenceLabel(item.font.license)}</span>
				{item.found_with && <span>From {item.found_with}</span>}
				<span className="ml-auto flex items-center gap-[18px]">
					<Link to={`/search?from=${item.font.id}`} className={linkClass}>
						More like this
					</Link>
					<button type="button" onClick={() => onRemove(item)} className={linkClass} aria-label={`Remove ${item.font.name}`}>
						Remove
					</button>
				</span>
			</div>
		</li>
	);
}

function TrailCard({ trail, hasMap }: { trail: Trail; hasMap: boolean }) {
	const last = trail.steps.at(-1);
	return (
		<li className="flex flex-col gap-3 border-b border-rule py-[22px]">
			{hasMap && <TrailThumbnail names={trail.steps.map((step) => step.name)} />}
			<span className="text-[16px] font-medium">
				{trail.origin} → {last?.name}
			</span>
			<span className="caption text-secondary">
				{trail.steps.length} {trail.steps.length === 1 ? 'step' : 'steps'} · {DATE_FORMAT.format(new Date(trail.saved_at))} ·{' '}
				<Link to={trailLink(trail)} className="text-ink underline underline-offset-[3px]">
					Open
				</Link>
			</span>
		</li>
	);
}

function Placeholder() {
	return (
		<ul className="m-0 list-none p-0" aria-hidden="true">
			{[60, 52].map((width) => (
				<li key={width} className="flex flex-col gap-[10px] border-b border-rule py-[18px]">
					<span className="block h-10 rounded bg-[#F2F3F1]" style={{ width: `${width}%` }} />
					<span className="block h-3 w-56 rounded bg-[#F2F3F1]" />
				</li>
			))}
		</ul>
	);
}

function Saved() {
	const navigate = useNavigate();
	const { user } = useAuth();
	const { requestSignIn } = useAccount();
	const showToast = useToast();
	const { preferences } = usePreferences();
	const { saved, save, remove } = useSaved();
	const [tab, setTab] = useState<'fonts' | 'trails'>('fonts');

	const search = (input: SearchInput) => {
		if (input.mode === 'text') navigate(`/search?q=${encodeURIComponent(input.query)}`);
		else navigate('/search', { state: { input } });
	};

	const removeFont = (item: SavedFont) =>
		remove.mutate(item.font.id, {
			onSuccess: () =>
				showToast({
					tone: 'success',
					message: `Removed ${item.font.name}`,
					action: { label: 'Undo', onClick: () => save.mutate({ font_id: item.font.id, found_with: item.found_with }) },
				}),
			onError: (error: Error) => showToast({ tone: 'error', message: `Couldn’t remove ${item.font.name}. ${error.message}` }),
		});

	const isExpired = saved.isError && /signed in/i.test(saved.error.message);
	const fonts = saved.data?.fonts ?? [];
	const trails = saved.data?.trails ?? [];
	const isEmpty = saved.isSuccess && fonts.length === 0 && trails.length === 0;
	const tabClass = (isActive: boolean) =>
		`flex h-9 flex-1 cursor-pointer items-center justify-center rounded-md text-[14px] ${isActive ? 'border border-ink bg-paper font-medium' : 'border border-transparent bg-transparent text-secondary'}`;

	return (
		<div className="flex min-h-screen flex-col bg-paper">
			<header className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-rule px-4 py-3 sm:px-8 lg:h-[72px] lg:flex-nowrap lg:py-0">
				<Link to="/" className="no-underline" aria-label="typeseek home">
					<Logo hasName={false} size={24} />
				</Link>
				<div className="order-3 w-full lg:order-none lg:w-[560px]">
					<SearchField onSearch={search} />
				</div>
				<div className="ml-auto">
					<AccountButton />
				</div>
			</header>

			<main className="mx-auto w-full max-w-[1440px] px-4 pt-8 pb-16 sm:px-8 sm:pt-10">
				<h1 className="m-0 text-[24px] leading-8 font-semibold tracking-[-0.02em] sm:sr-only">Saved</h1>

				{!user && (
					<div className="mx-auto max-w-[560px] py-16 text-center">
						<p className="m-0 text-[22px] font-semibold tracking-[-0.015em]">Sign in to see what you’ve saved</p>
						<p className="mt-3 mb-6 text-[15px] leading-[22px] text-secondary">Saved fonts and trails are kept on your account, so they’re here on any device.</p>
						<button type="button" onClick={() => requestSignIn('Sign in to see your saved fonts')} className="h-11 cursor-pointer rounded-lg border-0 bg-ink px-5 text-[15px] font-medium text-paper hover:bg-[#2A3631]">
							Sign in
						</button>
					</div>
				)}

				{user && isExpired && (
					<div role="status" className="mt-4 flex flex-wrap items-center gap-[14px] rounded-lg bg-ground px-4 py-3 text-[14px] leading-5">
						You’ve been signed out after 30 days. Your saved fonts are safe.
						<button type="button" onClick={() => requestSignIn('Sign in again', () => saved.refetch())} className="ml-auto h-9 cursor-pointer rounded-lg border border-ink bg-paper px-[14px] text-[14px] font-medium">
							Sign in again
						</button>
					</div>
				)}

				{user && saved.isError && !isExpired && (
					<div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-error-tint px-4 py-3 text-[14px] text-error-ink">
						Your saved fonts didn’t load. {saved.error.message}
						<button type="button" onClick={() => saved.refetch()} className="h-8 cursor-pointer rounded-[7px] border border-error bg-paper px-3 text-[13px] font-medium text-error-ink">
							Try again
						</button>
					</div>
				)}

				{user && isEmpty && (
					<div className="max-w-[560px] rounded-[10px] border border-rule p-7">
						<p className="m-0 text-[22px] font-semibold tracking-[-0.015em]">Nothing saved yet</p>
						<p className="mt-3 mb-6 text-[15px] leading-[22px] text-secondary">
							Press Save on any font and it lands here with the search or photo that found it. Fonts you reach through More like this keep their trail.
						</p>
						<Link to="/search" className="inline-flex h-11 items-center rounded-lg bg-ink px-5 text-[15px] font-medium text-paper no-underline">
							Start a search
						</Link>
					</div>
				)}

				{user && !isEmpty && !saved.isError && (
					<>
						<div className="mt-4 flex gap-1 rounded-lg bg-ground p-[3px] lg:hidden" role="tablist" aria-label="Saved">
							<button type="button" role="tab" aria-selected={tab === 'fonts'} onClick={() => setTab('fonts')} className={tabClass(tab === 'fonts')}>
								Fonts · {fonts.length}
							</button>
							<button type="button" role="tab" aria-selected={tab === 'trails'} onClick={() => setTab('trails')} className={tabClass(tab === 'trails')}>
								Trails · {trails.length}
							</button>
						</div>
						<div className="mt-2 grid grid-cols-1 gap-14 lg:mt-0 lg:grid-cols-[minmax(0,1fr)_420px]">
							<section aria-labelledby="saved-fonts" className={`${tab === 'fonts' ? '' : 'hidden'} min-w-0 lg:block`}>
								<div className="hidden items-baseline justify-between border-b border-ink pb-4 lg:flex">
									<h2 id="saved-fonts" className="m-0 text-[28px] font-semibold tracking-[-0.02em]">
										Saved fonts
									</h2>
									<span className="caption text-secondary">{fonts.length} fonts · newest first</span>
								</div>
								{saved.isPending ? <Placeholder /> : (
									<ul className="m-0 list-none p-0">
										{fonts.map((item) => (
											<SavedStrip key={item.font.id} item={item} previewWords={preferences.preview_words} onRemove={removeFont} />
										))}
									</ul>
								)}
							</section>
							<section aria-labelledby="saved-trails" className={`${tab === 'trails' ? '' : 'hidden'} min-w-0 lg:block`}>
								<div className="hidden items-baseline justify-between border-b border-ink pb-4 lg:flex">
									<h2 id="saved-trails" className="m-0 text-[28px] font-semibold tracking-[-0.02em]">
										Trails
									</h2>
									<span className="caption text-secondary">{trails.length} trails</span>
								</div>
								{saved.isPending ? <Placeholder /> : (
									<ul className="m-0 list-none p-0">
										{trails.map((trail, index) => (
											<TrailCard key={trail.id} trail={trail} hasMap={index === 0} />
										))}
									</ul>
								)}
								<p className="mt-[18px] mb-0 text-[14px] leading-[21px] text-muted">
									A trail is kept when you save a font you reached with “More like this”, so you can walk the same path again.
								</p>
							</section>
						</div>
					</>
				)}
			</main>
		</div>
	);
}

export default Saved;
