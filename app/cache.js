(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SandvikCache = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const KEYS = {
    quizBank: 'sandvik.training.quizBank.v1',
    attempts: 'sandvik.training.pendingAttempts.v1',
    profile: 'sandvik.training.profile.v1',
  };

  function memoryStorage() {
    const data = new Map();
    return {
      getItem: (key) => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => data.set(key, String(value)),
      removeItem: (key) => data.delete(key),
    };
  }

  function createMemoryCache() {
    return createCache(memoryStorage());
  }

  function parse(value, fallback) {
    if (!value) return fallback;
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function createCache(storage) {
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : memoryStorage());
    return {
      saveQuizBank(quizBank) {
        const stamped = { ...quizBank, cachedAt: new Date().toISOString() };
        store.setItem(KEYS.quizBank, JSON.stringify(stamped));
        return stamped;
      },
      getQuizBank() {
        return parse(store.getItem(KEYS.quizBank), null);
      },
      saveProfile(profile) {
        store.setItem(KEYS.profile, JSON.stringify(profile));
      },
      getProfile() {
        return parse(store.getItem(KEYS.profile), { role: 'trainee' });
      },
      enqueueAttempt(attempt) {
        const attempts = this.getPendingAttempts();
        attempts.push({ ...attempt, queued_at: new Date().toISOString() });
        store.setItem(KEYS.attempts, JSON.stringify(attempts));
        return attempts;
      },
      replacePendingAttempts(attempts) {
        store.setItem(KEYS.attempts, JSON.stringify(attempts || []));
      },
      getPendingAttempts() {
        return parse(store.getItem(KEYS.attempts), []);
      },
      clear() {
        Object.values(KEYS).forEach((key) => store.removeItem(key));
      },
    };
  }

  return { KEYS, createCache, createMemoryCache };
});
