import { createContext, useContext } from 'react';

export interface AccountActions {
	/** Opens the sign-in dialog; `afterSignIn` runs once Google has signed the person in. */
	requestSignIn: (title: string, afterSignIn?: () => void) => void;
	openSettings: () => void;
}

export const AccountContext = createContext<AccountActions>({ requestSignIn: () => {}, openSettings: () => {} });

export function useAccount(): AccountActions {
	return useContext(AccountContext);
}
