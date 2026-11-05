import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToast, type ShowToast } from '../contexts/toastContext';
import { ToastProvider } from './Toast';

let show: ShowToast = () => {};
function Capture() {
	show = useToast();
	return null;
}

describe('Toast', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('lets a success leave on its own after four seconds', () => {
		render(<ToastProvider><Capture /></ToastProvider>);
		act(() => show({ tone: 'success', message: 'Saved Cormorant' }));
		expect(screen.getByText('Saved Cormorant')).toBeInTheDocument();
		act(() => vi.advanceTimersByTime(4100));
		expect(screen.queryByText('Saved Cormorant')).not.toBeInTheDocument();
	});

	it('keeps an error until it is dismissed, and offers its action', () => {
		const retry = vi.fn();
		render(<ToastProvider><Capture /></ToastProvider>);
		act(() => show({ tone: 'error', message: 'Couldn’t save Cormorant.', action: { label: 'Retry', onClick: retry } }));
		act(() => vi.advanceTimersByTime(10000));
		expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save Cormorant.');
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(retry).toHaveBeenCalledOnce();
		expect(screen.queryByText('Couldn’t save Cormorant.')).not.toBeInTheDocument();
	});
});
