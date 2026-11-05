import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAccount } from '../../contexts/accountContext';

/** Signed out: a quiet "Sign in". Signed in: Saved, and the initial that opens settings. */
export function AccountButton() {
	const { user } = useAuth();
	const { requestSignIn, openSettings } = useAccount();

	if (!user) {
		return (
			<button type="button" onClick={() => requestSignIn('Sign in to Typeseek')} className="h-9 shrink-0 cursor-pointer rounded-lg border border-line bg-paper px-[14px] text-[14px] font-medium hover:border-ink">
				Sign in
			</button>
		);
	}
	const name = user.name || user.email;
	return (
		<div className="flex items-center gap-5">
			<Link to="/saved" className="text-[15px] font-medium text-ink no-underline hover:underline">
				Saved
			</Link>
			<button
				type="button"
				onClick={openSettings}
				aria-label={`Settings for ${name}`}
				className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-ground text-[14px] font-semibold text-ink hover:bg-rule"
			>
				{name.slice(0, 1).toUpperCase()}
			</button>
		</div>
	);
}
