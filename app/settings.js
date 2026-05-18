(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SandvikSettings = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULTS = {
    appSource: 'training_app',
    siteUrl: 'app://mining-training',
    redirectTo: 'app://mining-training/auth-callback',
    syncIntervalMs: 5 * 60 * 1000,
  };

  function getRuntimeConfig() {
    const fromWindow = typeof window !== 'undefined' ? (window.SANDVIK_TRAINING_CONFIG || {}) : {};
    return {
      ...DEFAULTS,
      supabaseUrl: fromWindow.supabaseUrl || '',
      supabaseAnonKey: fromWindow.supabaseAnonKey || '',
    };
  }

  return { DEFAULTS, getRuntimeConfig };
});
