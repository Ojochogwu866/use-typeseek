import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TrailBar } from './TrailBar';

describe('TrailBar', () => {
	it('shows the whole path from the search to the current font, and steps back', () => {
		const onBack = vi.fn();
		render(<TrailBar origin="“elegant thin serif”" steps={['Cormorant', 'IM Fell French Canon SC']} onBack={onBack} />);
		expect(screen.getByText('“elegant thin serif”')).toBeInTheDocument();
		expect(screen.getByText('IM Fell French Canon SC')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: '← Back' }));
		expect(onBack).toHaveBeenCalledOnce();
	});
});
