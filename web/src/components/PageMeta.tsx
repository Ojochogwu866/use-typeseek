const SITE = 'https://usetypeseek.xyz';

interface PageMetaProps {
	title?: string;
	/** Set for pages worth listing in search engines; pages without one are kept out of the index. */
	path?: string;
}

/** The tab title, canonical address and indexing rule for one page; React lifts these into the head. */
export function PageMeta({ title, path }: PageMetaProps) {
	return (
		<>
			<title>{title ? `${title} — typeseek` : 'typeseek — find a font by how it looks'}</title>
			{path ? <link rel="canonical" href={`${SITE}${path}`} /> : <meta name="robots" content="noindex" />}
		</>
	);
}
