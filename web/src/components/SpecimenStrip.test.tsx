import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FontResult } from '../api/types';
import type { FontStatus } from '../hooks/useFontStatus';
import { SpecimenStrip } from './SpecimenStrip';

let status: FontStatus = 'ready';
vi.mock('../hooks/useFontStatus', () => ({ useFontStatus: () => status }));

const font: FontResult = {
	id: 7,
	name: 'Cormorant',
	category: 'serif',
	license: 'commercial-ok',
	source_url: 'https://fonts.google.com/specimen/Cormorant',
};

function renderStrip(overrides: Partial<Parameters<typeof SpecimenStrip>[0]> = {}) {
	const props = { font, rank: 2, previewWords: 'The Evening Edition', isSelected: false, onOpen: vi.fn(), onMoreLikeThis: vi.fn(), ...overrides };
	render(
		<ol>
			<SpecimenStrip {...props} />
		</ol>
	);
	return props;
}

describe('SpecimenStrip', () => {
	it('sets the preview words in the font itself once it has loaded', () => {
		status = 'ready';
		renderStrip();
		expect(screen.getByText('The Evening Edition')).toHaveStyle({ fontFamily: '"Cormorant", serif' });
	});

	it('always states the licence, so "can I use this?" is answered on the result', () => {
		renderStrip();
		expect(screen.getByText('Commercial OK')).toBeInTheDocument();
	});

	it('opens the font from the specimen and walks to its neighbours from More like this', () => {
		const props = renderStrip();
		fireEvent.click(screen.getByRole('button', { name: /Cormorant, result 2/ }));
		fireEvent.click(screen.getByRole('button', { name: 'More like this' }));
		expect(props.onOpen).toHaveBeenCalledWith(7);
		expect(props.onMoreLikeThis).toHaveBeenCalledWith(font);
	});

	it('says plainly when a preview fails to load, and keeps the result in place', () => {
		status = 'failed';
		renderStrip();
		expect(screen.getByText(/Preview didn’t load/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
		expect(screen.getByText('Cormorant')).toBeInTheDocument();
	});

	it('marks the open result for assistive tech', () => {
		status = 'ready';
		renderStrip({ isSelected: true });
		expect(screen.getByRole('button', { name: /Cormorant, result 2/ })).toHaveAttribute('aria-current', 'true');
	});
});
