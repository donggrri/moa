(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.MoaNotes = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TAG_RE = /#([A-Za-z0-9가-힣_-]{1,40})/g;
  var WIKI_RE = /\[\[([^\[\]]{1,200})\]\]/g;
  var ASSET_RE = /moa-asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  var BODY_LIMIT = 102400;
  var TITLE_LIMIT = 200;

  function unique(values) {
    var seen = {};
    var out = [];
    (values || []).forEach(function (value) {
      var key = String(value || '');
      if (!key || seen[key]) return;
      seen[key] = true;
      out.push(key);
    });
    return out;
  }

  function extractTags(text) {
    var source = String(text || '');
    var tags = [];
    var match;
    TAG_RE.lastIndex = 0;
    while ((match = TAG_RE.exec(source))) {
      tags.push(match[1].toLowerCase());
    }
    return unique(tags);
  }

  function extractWikiTitles(text) {
    var source = String(text || '');
    var titles = [];
    var match;
    WIKI_RE.lastIndex = 0;
    while ((match = WIKI_RE.exec(source))) {
      var title = match[1].trim();
      if (title) titles.push(title);
    }
    return unique(titles);
  }

  function rewriteWikiLinks(markdown, handler) {
    return String(markdown || '').replace(WIKI_RE, function (full, title) {
      if (typeof handler !== 'function') return title.trim();
      return handler(title.trim(), full);
    });
  }

  function rewriteAssets(markdown, urlMap) {
    return String(markdown || '').replace(ASSET_RE, function (full, id) {
      var url = urlMap && urlMap[id.toLowerCase()];
      return url || full;
    });
  }

  function stripUnsafeProtocols(html) {
    return String(html || '')
      .replace(/\shref="javascript:[^"]*"/gi, ' href="#"')
      .replace(/\ssrc="javascript:[^"]*"/gi, '');
  }

  function renderMarkdown(markdown, options) {
    options = options || {};
    var source = rewriteWikiLinks(
      rewriteAssets(markdown, options.assetUrls || {}),
      options.wikiHandler || function (title) { return title; }
    );
    var html = source;
    if (typeof markdownit === 'function') {
      html = markdownit({
        html: false,
        linkify: true,
        breaks: true
      }).render(source);
    } else {
      html = source
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br />');
    }
    if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
      html = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          'a', 'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
          'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'img',
          'input', 'span'
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'type', 'checked', 'disabled'],
        ALLOW_DATA_ATTR: false
      });
    }
    return stripUnsafeProtocols(html);
  }

  function publicShareUrl(token) {
    var href = '';
    try {
      href = String(root.location && root.location.href ? root.location.href : '');
    } catch (error) {
      href = '';
    }
    var url;
    try {
      url = new URL(href);
    } catch (error) {
      return 'public.html#t=' + encodeURIComponent(token || '');
    }
    var path = url.pathname.replace(/index\.html$/i, '');
    if (!/\/$/.test(path)) path += '/';
    return url.origin + path + 'public.html#t=' + encodeURIComponent(token || '');
  }

  return {
    BODY_LIMIT: BODY_LIMIT,
    TITLE_LIMIT: TITLE_LIMIT,
    extractTags: extractTags,
    extractWikiTitles: extractWikiTitles,
    rewriteWikiLinks: rewriteWikiLinks,
    rewriteAssets: rewriteAssets,
    renderMarkdown: renderMarkdown,
    publicShareUrl: publicShareUrl
  };
}));
