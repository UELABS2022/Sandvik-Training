(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SandvikSupabaseClient = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  const Settings = root && root.SandvikSettings;
  const Cache = root && root.SandvikCache;
  const Adapter = root && root.SandvikQuizAdapter;
  const Queue = root && root.SandvikSyncQueue;

  function createNoopSupabase() {
    return {
      auth: {
        signInWithOtp: async () => ({ error: new Error('Supabase client not loaded') }),
        getSession: async () => ({ data: { session: null }, error: null }),
        setSession: async () => ({ data: { session: null }, error: null }),
      },
      from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }), insert: async () => ({ error: null }) }),
    };
  }

  function makeSupabase(config) {
    if (root && root.supabase && config.supabaseUrl && config.supabaseAnonKey) {
      return root.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    }
    return createNoopSupabase();
  }

  async function fetchRows(sb) {
    const selectAll = async (table) => {
      const result = await sb.from(table).select('*');
      if (result.error) throw result.error;
      return result.data || [];
    };
    return {
      sections: await selectAll('sections'),
      quiz_sets: await selectAll('quiz_sets'),
      questions: await selectAll('questions'),
      answers: await selectAll('answers'),
    };
  }

  function createTrainingClient(options = {}) {
    const config = options.config || (Settings ? Settings.getRuntimeConfig() : {});
    const cache = options.cache || (Cache ? Cache.createCache() : null);
    const adapter = options.adapter || Adapter;
    const sb = options.supabase || makeSupabase(config);

    async function signInWithOtp(email) {
      return sb.auth.signInWithOtp({ email, options: { emailRedirectTo: config.redirectTo || 'app://mining-training/auth-callback' } });
    }

    async function cacheThenSync() {
      const cached = cache && cache.getQuizBank();
      const refresh = (async () => {
        const rows = await fetchRows(sb);
        const quizBank = adapter.rowsToQuizBank(rows);
        if (cache) cache.saveQuizBank(quizBank);
        return quizBank;
      })();
      if (cached) {
        refresh.catch(() => null);
        return cached;
      }
      return refresh;
    }

    async function getQuizBank() {
      return cacheThenSync();
    }

    async function postAttempt(attempt) {
      const result = await sb.from('attempts').insert(attempt);
      return { ok: !result.error, error: result.error || null };
    }

    const queue = Queue && cache ? Queue.createSyncQueue({ cache, postAttempt }) : null;

    return { supabase: sb, signInWithOtp, cacheThenSync, getQuizBank, postAttempt, queue, cache };
  }

  return { createTrainingClient, createNoopSupabase, fetchRows };
});
