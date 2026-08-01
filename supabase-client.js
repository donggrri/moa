(function (global) {
  'use strict';

  function getConfig() {
    var config = global.MOA_SUPABASE_CONFIG || {};
    return {
      url: String(config.url || '').trim(),
      publishableKey: String(config.publishableKey || '').trim()
    };
  }

  function isConfigured() {
    var config = getConfig();
    return Boolean(config.url && config.publishableKey && global.supabase && global.supabase.createClient);
  }

  function createClient() {
    var config = getConfig();
    if (!isConfigured()) return null;
    return global.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }

  global.MoaSupabase = {
    getConfig: getConfig,
    isConfigured: isConfigured,
    createClient: createClient
  };
}(window));
