(function () {
  'use strict';

  function tokenFromHash() {
    var hash = String(window.location.hash || '').replace(/^#/, '');
    var params = new URLSearchParams(hash.indexOf('=') === -1 ? ('t=' + hash) : hash);
    return String(params.get('t') || '').trim();
  }

  function showMessage(title, body) {
    document.getElementById('publicNote').innerHTML = [
      '<p class="public-note-kicker">MOA PUBLIC NOTE</p>',
      '<h1>' + escapeHtml(title) + '</h1>',
      '<p class="auth-description">' + escapeHtml(body) + '</p>'
    ].join('');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function signedUrls(client, assets) {
    var map = {};
    await Promise.all((assets || []).map(async function (asset) {
      if (!asset || !asset.id || !asset.storage_path) return;
      var result = await client.storage.from('note-images').createSignedUrl(asset.storage_path, 3600);
      if (!result.error && result.data && result.data.signedUrl) {
        map[String(asset.id).toLowerCase()] = result.data.signedUrl;
      }
    }));
    return map;
  }

  async function init() {
    var token = tokenFromHash();
    if (!token) {
      showMessage('공개 링크가 없어요', '주소 끝의 #t= 값이 필요합니다.');
      return;
    }
    if (!window.MoaSupabase || !window.MoaSupabase.isConfigured()) {
      showMessage('설정을 확인해주세요', 'Supabase 공개 설정이 없어 노트를 열 수 없습니다.');
      return;
    }
    var client = window.MoaSupabase.createClient();
    var result = await client.rpc('get_published_note', { p_token: token });
    if (result.error || !result.data) {
      showMessage('노트를 찾을 수 없어요', '링크가 만료됐거나 공개가 중지되었습니다.');
      return;
    }
    var note = result.data;
    var assetUrls = await signedUrls(client, note.assets || []);
    var html = window.MoaNotes.renderMarkdown(note.body_md || '', {
      assetUrls: assetUrls,
      wikiHandler: function (title) { return title; }
    });
    document.title = (note.title || '공개 노트') + ' — 모아';
    document.getElementById('publicNote').innerHTML = [
      '<p class="public-note-kicker">' + escapeHtml(note.space_name || '모아') + '</p>',
      '<h1>' + escapeHtml(note.title || '제목 없는 노트') + '</h1>',
      '<p class="public-note-warning">이 페이지는 읽기 전용입니다. 링크를 아는 사람은 누구나 볼 수 있어요.</p>',
      '<article class="markdown-body">' + html + '</article>'
    ].join('');
  }

  window.addEventListener('hashchange', init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
