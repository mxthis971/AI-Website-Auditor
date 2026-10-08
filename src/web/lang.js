// Language choice for the homepage: English lives at "/", French at "/fr/".
// First visit: the browser's Accept-Language decides. The result (or a choice
// made with the EN/FR switch, which links to "?lang=xx") is kept in a cookie.
// Search engines send no Accept-Language, so they always see both URLs as-is.

export const LANG_COOKIE = 'lang';
const ONE_YEAR = 365 * 24 * 3600;

/** "fr" when French is the browser's preferred language among fr/en, else "en". */
export function langFromAcceptLanguage(header) {
  let best = { lang: 'en', q: 0 };
  for (const part of String(header || '').split(',')) {
    const [tag, ...params] = part.trim().toLowerCase().split(';');
    const base = tag.split('-')[0];
    if (base !== 'fr' && base !== 'en') continue;
    const qParam = params.find((p) => p.trim().startsWith('q='));
    const q = qParam ? Number(qParam.trim().slice(2)) : 1;
    if (Number.isFinite(q) && q > best.q) best = { lang: base, q };
  }
  return best.lang;
}

export function langFromCookie(header) {
  const m = /(?:^|;\s*)lang=(en|fr)(?:;|$)/.exec(String(header || ''));
  return m ? m[1] : null;
}

export function setLangCookie(req, reply, lang) {
  const secure = req.protocol === 'https' ? '; Secure' : '';
  reply.header('set-cookie', `${LANG_COOKIE}=${lang}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure}`);
}

/**
 * Decides what to do for a homepage request.
 * Returns { lang, redirect } where redirect is a path or null.
 */
export function homepageLang(req, pageLang) {
  const home = (l) => (l === 'fr' ? '/fr/' : '/');
  const chosen = req.query?.lang === 'fr' || req.query?.lang === 'en' ? req.query.lang : null;
  if (chosen) return { lang: chosen, store: true, redirect: home(chosen) };

  const saved = langFromCookie(req.headers.cookie);
  if (saved) return { lang: saved, store: false, redirect: pageLang === 'en' && saved === 'fr' ? '/fr/' : null };

  // First visit. Only "/" is redirected: a visitor who opened /fr/ asked for French.
  if (pageLang === 'fr') return { lang: 'fr', store: true, redirect: null };
  if (!req.headers['accept-language']) return { lang: 'en', store: false, redirect: null };
  const detected = langFromAcceptLanguage(req.headers['accept-language']);
  return { lang: detected, store: true, redirect: detected === 'fr' ? '/fr/' : null };
}
