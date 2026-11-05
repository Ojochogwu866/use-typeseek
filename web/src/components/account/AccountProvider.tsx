import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { AccountContext } from '../../contexts/accountContext';
import { deleteAccount } from '../../api/account';
import { useAuth } from '../../hooks/useAuth';
import { useDelayedUnmount } from '../../hooks/useDelayedUnmount';
import { useToast } from '../../contexts/toastContext';
import { SettingsDrawer } from './SettingsDrawer';
import { SignInDialog } from './SignInDialog';

// Must match the drawer-out animation in index.css.
const DRAWER_EXIT_MS = 200;


/** Owns the sign-in dialog and the settings drawer so any screen can ask for them and carry on afterwards. */
export function AccountProvider({ children }: { children: ReactNode }) {
	const { user, googleAuth, logout } = useAuth();
	const queryClient = useQueryClient();
	const showToast = useToast();
	const [signInTitle, setSignInTitle] = useState<string | null>(null);
	const [failure, setFailure] = useState<string | null>(null);
	const [isSettingsOpen, setIsSettingsOpen] = useState(false);
	const shouldRenderSettings = useDelayedUnmount(isSettingsOpen, DRAWER_EXIT_MS);
	const afterSignIn = useRef<(() => void) | undefined>(undefined);
	const opener = useRef<HTMLElement | null>(null);

	const requestSignIn = useCallback((title: string, then?: () => void) => {
		opener.current = document.activeElement as HTMLElement | null;
		afterSignIn.current = then;
		setFailure(null);
		setSignInTitle(title);
	}, []);

	const closeSignIn = useCallback(() => {
		setSignInTitle(null);
		afterSignIn.current = undefined;
		opener.current?.focus();
	}, []);

	const onCredential = useCallback(
		(credential: string) => {
			setFailure(null);
			googleAuth.mutate(credential, {
				onSuccess: () => {
					const then = afterSignIn.current;
					afterSignIn.current = undefined;
					setSignInTitle(null);
					queryClient.invalidateQueries({ queryKey: ['preferences'] });
					then?.();
				},
				onError: () => setFailure('Google didn’t finish signing you in.'),
			});
		},
		[googleAuth, queryClient]
	);

	const openSettings = useCallback(() => {
		opener.current = document.activeElement as HTMLElement | null;
		setIsSettingsOpen(true);
	}, []);

	const closeSettings = useCallback(() => {
		setIsSettingsOpen(false);
		opener.current?.focus();
	}, []);

	const removeAccount = useMutation({
		mutationFn: deleteAccount,
		onSuccess: () => {
			queryClient.setQueryData(['auth', 'me'], null);
			queryClient.removeQueries({ queryKey: ['saved'] });
			setIsSettingsOpen(false);
			showToast({ tone: 'success', message: 'Your account and everything in it is deleted.' });
		},
		onError: (error: Error) => showToast({ tone: 'error', message: `Couldn’t delete your account. ${error.message}` }),
	});

	const signOut = () =>
		logout.mutate(undefined, {
			onSuccess: () => {
				queryClient.removeQueries({ queryKey: ['saved'] });
				setIsSettingsOpen(false);
				showToast({ tone: 'success', message: 'Signed out' });
			},
			onError: (error: Error) => showToast({ tone: 'error', message: `Couldn’t sign out. ${error.message}` }),
		});

	return (
		<AccountContext.Provider value={{ requestSignIn, openSettings }}>
			{children}
			{shouldRenderSettings && (
				<SettingsDrawer
					user={user}
					isClosing={!isSettingsOpen}
					isDeleting={removeAccount.isPending}
					onClose={closeSettings}
					onSignIn={() => requestSignIn('Sign in to Typeseek')}
					onSignOut={signOut}
					onDeleteAccount={() => removeAccount.mutate()}
				/>
			)}
			{signInTitle && <SignInDialog title={signInTitle} isSigningIn={googleAuth.isPending} failure={failure} onCredential={onCredential} onClose={closeSignIn} />}
		</AccountContext.Provider>
	);
}
