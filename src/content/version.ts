export const CONTENT_VERSION = 'mvp-v2.5-alpha.2';
/**
 * Earlier content versions whose cards, choices and scoring are identical to the current ones. A save written under one of
 * them is brought up to CONTENT_VERSION by the loader; profile evidence scored under one of them stays valid as written.
 */
export const COMPATIBLE_CONTENT_VERSIONS: readonly string[] = ['mvp-v2.5-alpha.1'];
