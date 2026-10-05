/** Set (by the splash itself) once the intro has played, so the same visitor does not see it on every page. */
export const SPLASH_COOKIE = "threevda_splash";
/** The intro is a first-visit gesture, not a toll: it comes back after half an hour away. */
export const SPLASH_SECONDS = 60 * 30;
