import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SearchInput } from './api/types';
import { AccountButton } from './components/account/AccountButton';
import { Logo } from './components/Logo';
import { MapExplorer } from './components/MapExplorer';
import { SearchField } from './components/SearchField';
import { useMapData } from './hooks/useMapData';

function Home() {
	const navigate = useNavigate();
	const map = useMapData();

	const search = (input: SearchInput) => {
		if (input.mode === 'text') navigate(`/search?q=${encodeURIComponent(input.query)}`);
		else navigate('/search', { state: { input } });
	};

	const pickFont = useCallback((fontId: number) => navigate(`/search?from=${fontId}`), [navigate]);

	return (
		<div className="flex h-dvh min-h-[640px] flex-col bg-ground">
			<header className="flex h-[72px] shrink-0 items-center justify-between px-4 sm:px-12">
				<Logo />
				<nav className="flex items-center gap-6 text-[15px] font-medium">
					<a href="/about" className="hidden text-ink no-underline hover:underline sm:inline">
						How the map works
					</a>
					<AccountButton />
				</nav>
			</header>

			<main className="relative flex-1">
				<h1 className="sr-only">typeseek: every free font, laid out by how it looks</h1>
				{map.data && <MapExplorer data={map.data} onPick={pickFont} />}
				{map.isError && <p className="p-12 text-[15px] text-secondary">The map didn’t load. You can still search below.</p>}

				<section
					aria-label="Search"
					className="absolute right-4 bottom-4 left-4 rounded-xl border border-ink bg-paper p-6 sm:right-12 sm:bottom-12 sm:left-auto sm:w-[520px] sm:p-7"
				>
					<p className="m-0 mb-4 text-[28px] leading-[32px] font-semibold tracking-[-0.03em] sm:mb-0 sm:text-[44px] sm:leading-[46px]" aria-hidden="true">
						Every free font, laid out by how it looks.
					</p>
					<p className="mt-4 mb-5 hidden text-[16px] leading-[23px] tracking-[-0.01em] text-secondary sm:block">
						Similar fonts sit together. Describe what you saw or drop in a photo, and Typeseek puts a pin on the map. Then walk to the neighbours until one is right.
					</p>
					<SearchField onSearch={search} />
				</section>
			</main>
		</div>
	);
}

export default Home;
