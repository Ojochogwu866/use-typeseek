const LICENCE_LABELS: Record<string, string> = {
	'commercial-ok': 'Commercial OK',
	'personal-only': 'Personal only',
	unclear: 'Licence unclear',
};

export function licenceLabel(licence: string): string {
	return LICENCE_LABELS[licence] ?? licence;
}
