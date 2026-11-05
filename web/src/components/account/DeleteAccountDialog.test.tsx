import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DeleteAccountDialog } from './DeleteAccountDialog';

describe('DeleteAccountDialog', () => {
	it('names what will be removed and offers keeping the account as the focused default', () => {
		render(<DeleteAccountDialog fontCount={4} trailCount={1} isDeleting={false} onConfirm={vi.fn()} onCancel={vi.fn()} />);
		expect(screen.getByText(/4 saved fonts and 1 trail/)).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Keep my account' })).toHaveFocus();
	});

	it('only deletes once the person has ticked that it cannot be undone', () => {
		const onConfirm = vi.fn();
		render(<DeleteAccountDialog fontCount={0} trailCount={0} isDeleting={false} onConfirm={onConfirm} onCancel={vi.fn()} />);
		const deleteButton = screen.getByRole('button', { name: 'Delete account' });
		expect(deleteButton).toBeDisabled();
		fireEvent.click(screen.getByLabelText('I understand this can’t be undone'));
		fireEvent.click(deleteButton);
		expect(onConfirm).toHaveBeenCalledOnce();
	});
});
