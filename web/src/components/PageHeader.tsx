import { Link } from 'react-router-dom';
import { AccountButton } from './account/AccountButton';
import { Logo } from './Logo';

/** Top bar for the plain pages: the name beside the mark, a way back to search, and sign-in. */
export function PageHeader({ current }: { current?: 'about' | 'privacy' }) {
	return (
		<header className="flex h-[72px] items-center justify-between border-b border-rule px-4 sm:px-8">
			<Link to="/" className="no-underline" aria-label="typeseek home">
				<Logo />
			</Link>
			<nav className="flex items-center gap-6 text-[15px] font-medium">
				<Link to="/search" className="text-ink no-underline hover:underline">
					Search
				</Link>
				<Link to="/about" aria-current={current === 'about' ? 'page' : undefined} className="hidden text-ink no-underline hover:underline aria-[current=page]:underline aria-[current=page]:underline-offset-[6px] sm:inline">
					About
				</Link>
				<AccountButton />
			</nav>
		</header>
	);
}

export function PageFooter() {
	return (
		<footer className="flex flex-wrap items-center gap-6 border-t border-rule px-4 py-6 text-[14px] text-muted sm:px-8">
			<span>Fonts from Google Fonts, each under its own open licence.</span>
			<Link to="/privacy" className="ml-auto font-medium text-ink underline underline-offset-[3px]">
				Privacy
			</Link>
			<a href="https://github.com/Ojochogwu866/typeseek" target="_blank" rel="noreferrer" className="font-medium text-ink underline underline-offset-[3px]">
				GitHub
			</a>
		</footer>
	);
}
