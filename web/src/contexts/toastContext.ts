import { createContext, useContext } from 'react';

interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface Toast {
	id: number;
	message: string;
	tone: 'success' | 'error';
	action?: ToastAction;
}

export type ShowToast = (toast: Omit<Toast, 'id'>) => void;

export const ToastContext = createContext<ShowToast>(() => {});

export function useToast(): ShowToast {
	return useContext(ToastContext);
}
