/** The search address that reopens a saved trail at its last step. */
export function trailLink(trail: { origin: string; steps: { id: number }[] }): string {
	return `/search?trail=${trail.steps.map((step) => step.id).join(',')}&origin=${encodeURIComponent(trail.origin)}`;
}
