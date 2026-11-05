import { useNavigate } from 'react-router-dom';
import type { SearchInput } from '../api/types';
import { Logo } from '../components/Logo';
import { SearchField } from '../components/SearchField';

function NotFound() {
	const navigate = useNavigate();
	const search = (input: SearchInput) => {
		if (input.mode === 'text') navigate(`/search?q=${encodeURIComponent(input.query)}`);
		else navigate('/search', { state: { input } });
	};

	return (
		<div className="flex min-h-screen flex-col bg-ground">
			<header className="flex h-[72px] items-center px-4 sm:px-8">
				<a href="/" className="no-underline" aria-label="typeseek home">
					<Logo />
				</a>
			</header>
			<main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 pb-24 text-center">
				<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
					<circle cx="20" cy="20" r="16" fill="none" stroke="#0F6B46" strokeWidth="2" strokeDasharray="4 5" />
				</svg>
				<p className="m-0 caption text-secondary">404 · Off the map</p>
				<h1 className="m-0 text-[32px] leading-[40px] font-semibold tracking-[-0.02em]">There’s no font here</h1>
				<p className="m-0 max-w-[460px] text-[16px] leading-[24px] tracking-[-0.01em] text-secondary">
					The link may be old, or the font may have left the index. Describe what you were after and we’ll find the closest.
				</p>
				<div className="mt-2 w-full max-w-[480px] text-left">
					<SearchField onSearch={search} />
				</div>
			</main>
		</div>
	);
}

export default NotFound;
