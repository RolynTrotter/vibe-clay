// Local persistence. Everything stays on the device — no account, no upload.
//
// A phone browser will happily discard the tab while Alex is glazing, so the
// imported library and the recipe in progress are written back to localStorage
// on every change. Reads are defensive: a corrupt or half-written value returns
// the fallback rather than taking the whole app down at boot.

const KEY = 'vibe-clay:v1';

const empty = () => ({ library: [], recipe: null, target: '', updated: null });

/** Read the persisted state, or a blank one if there's nothing usable. */
export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    return {
      library: Array.isArray(parsed.library) ? parsed.library : [],
      recipe: parsed.recipe && Array.isArray(parsed.recipe.lines) ? parsed.recipe : null,
      target: typeof parsed.target === 'string' ? parsed.target : '',
      updated: parsed.updated || null,
    };
  } catch {
    return empty();
  }
}

/**
 * Persist. Returns false if the write failed (private mode, quota) so the caller
 * can tell the user their work isn't being saved instead of pretending it is.
 */
export function save({ library, recipe, target }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      library: library || [],
      recipe: recipe || null,
      target: target || '',
      updated: new Date().toISOString(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); return true; } catch { return false; }
}

/** True if this browser will actually let us persist. */
export function available() {
  try {
    const probe = KEY + ':probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
