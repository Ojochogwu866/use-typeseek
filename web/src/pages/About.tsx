import { PageFooter, PageHeader } from '../components/PageHeader';

const STEPS = [
	{
		title: 'Describe it, or show it',
		body: 'Type a few words like “elegant thin serif”, or drop a photo of lettering you saw. A vision model reads both into the same space the fonts live in.',
	},
	{
		title: 'See the closest, set in your words',
		body: 'Results are the fonts themselves, ranked by how near they sit. We say closest, not exact: a free match to a paid typeface is often the point.',
	},
	{
		title: 'Walk to the next one',
		body: 'More like this moves you to a font’s neighbours on the map. Two or three steps usually get you there, and the trail lets you step back.',
	},
];

function About() {
	return (
		<div className="flex min-h-screen flex-col bg-paper">
			<PageHeader current="about" />
			<main className="flex-1">
				<div className="mx-auto max-w-[1100px] px-4 pt-14 pb-10 sm:px-8 sm:pt-[72px]">
					<p className="m-0 caption text-secondary">About</p>
					<h1 className="mt-3 mb-0 text-[34px] leading-[40px] font-semibold tracking-[-0.025em] sm:text-[44px] sm:leading-[52px]">Find a font by how it looks</h1>
					<p className="mt-4 mb-0 max-w-[640px] text-[17px] leading-[26px] tracking-[-0.01em] text-secondary">
						Most people can’t name what they like about a typeface, but they know it the moment they see it. Typeseek is built for that: describe it roughly or show a photo, look at the closest fonts, and walk toward the one you meant.
					</p>
				</div>
				<figure className="mx-4 my-0 sm:mx-8">
					<img src="/map-whole.svg" width={1344} height={660} loading="lazy" alt="All 1,910 fonts as dots, in coloured clusters by style" className="block h-auto w-full rounded-[10px] bg-ground" />
					<figcaption className="mt-3 caption text-secondary">Every dot is one of 1,910 free fonts · similar fonts sit together</figcaption>
				</figure>
				<ol className="mx-auto grid max-w-[1100px] list-none gap-10 px-4 pt-12 pb-20 sm:px-8 md:grid-cols-3">
					{STEPS.map((step, index) => (
						<li key={step.title}>
							<span className="font-mono text-[12px] text-accent">{String(index + 1).padStart(2, '0')}</span>
							<h2 className="mt-2 mb-2 text-[19px] leading-[26px] font-semibold tracking-[-0.015em]">{step.title}</h2>
							<p className="m-0 text-[15px] leading-[23px] tracking-[-0.005em] text-secondary">{step.body}</p>
						</li>
					))}
				</ol>
			</main>
			<PageFooter />
		</div>
	);
}

export default About;
