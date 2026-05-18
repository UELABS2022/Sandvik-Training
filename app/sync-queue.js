(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SandvikSyncQueue = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function createSyncQueue({ cache, postAttempt }) {
    if (!cache) throw new Error('cache is required');
    const poster = postAttempt || (async () => ({ ok: false, error: 'offline' }));
    return {
      async recordAttempt(attempt) {
        const payload = {
          ...attempt,
          app_source: attempt.app_source || 'training_app',
          attempted_at: attempt.attempted_at || new Date().toISOString(),
        };
        try {
          const result = await poster(payload);
          if (result && result.ok) return { synced: true, queued: false };
        } catch (_err) {
          // Offline-first: never block quiz UI on network failure.
        }
        cache.enqueueAttempt(payload);
        return { synced: false, queued: true };
      },
      async drain() {
        const pending = cache.getPendingAttempts();
        const remaining = [];
        for (const attempt of pending) {
          try {
            const result = await poster(attempt);
            if (!result || !result.ok) remaining.push(attempt);
          } catch (_err) {
            remaining.push(attempt);
          }
        }
        cache.replacePendingAttempts(remaining);
        return { attempted: pending.length, synced: pending.length - remaining.length, remaining: remaining.length };
      },
    };
  }
  return { createSyncQueue };
});
