import { PageFooter, PageHeader } from '../components/PageHeader';

const SECTIONS = [
	{
		title: 'When you search',
		body: 'Your words or photo are turned into numbers, compared with the index, and then discarded. Photos are read in memory and never written to disk, and we don’t log what you search for. The previews you see load from Google Fonts, so Google receives a request for each font shown, as it would on any site that uses Google Fonts.',
	},
	{
		title: 'When you sign in',
		body: 'Sign-in is through Google only. We receive and keep your name, your email and Google’s account ID for you, and nothing else from your Google account. We also keep the fonts and trails you save and your search preferences. One cookie keeps you signed in for 30 days. There are no tracking or advertising cookies.',
	},
	{
		title: 'Your control',
		body: 'In Settings you can download everything we keep as one file, or delete your account. Deleting removes your name, email, saved fonts, trails and preferences straight away. Signed out, your preferences stay in this browser only.',
	},
	{
		title: 'Where it lives',
		body: 'Account data is stored in a Postgres database hosted by Neon in the EU (Frankfurt). It is never sold or shared.',
	},
];

function Privacy() {
	return (
		<div className="flex min-h-screen flex-col bg-paper">
			<PageHeader current="privacy" />
			<main className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-12 px-4 pt-14 pb-20 sm:px-8 lg:flex-row lg:gap-24">
				<article className="max-w-[640px]">
					<p className="m-0 caption text-secondary">Privacy · updated 5 November 2026</p>
					<h1 className="mt-3 mb-0 text-[32px] leading-[40px] font-semibold tracking-[-0.025em] sm:text-[40px] sm:leading-[48px]">What Typeseek keeps, and what it doesn’t</h1>
					<p className="mt-4 mb-0 text-[17px] leading-[26px] tracking-[-0.01em] text-secondary">
						You can search without an account, and nothing about that search is kept. An account exists only so you can save fonts.
					</p>
					{SECTIONS.map((section) => (
						<section key={section.title} className="mt-7 border-t border-rule pt-5">
							<h2 className="m-0 text-[19px] leading-[26px] font-semibold tracking-[-0.015em]">{section.title}</h2>
							<p className="mt-2 mb-0 text-[15px] leading-[24px] tracking-[-0.005em] text-secondary">{section.body}</p>
						</section>
					))}
				</article>
				<aside className="h-fit rounded-[10px] bg-ground p-6 lg:mt-[44px] lg:w-[300px] lg:shrink-0">
					<p className="m-0 caption text-secondary">In short</p>
					<ul className="mt-3 mb-0 flex list-none flex-col gap-3 p-0 text-[15px] leading-[23px]">
						<li>Searches and photos: not kept.</li>
						<li>Signed in: name, email, saved fonts, trails, preferences.</li>
						<li>One sign-in cookie. No trackers.</li>
						<li>Download or delete it any time.</li>
					</ul>
				</aside>
			</main>
			<PageFooter />
		</div>
	);
}

export default Privacy;
