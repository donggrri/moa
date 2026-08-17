const test = require('node:test');
const assert = require('node:assert/strict');
const notes = require('./notes-render.js');

test('extracts hashtags and ignores markdown headings', () => {
  const tags = notes.extractTags('# 제목\n본문 #집안일 과 #장보기\n');
  assert.deepEqual(tags, ['집안일', '장보기']);
});

test('extracts wiki titles', () => {
  const titles = notes.extractWikiTitles('관련: [[장보기 목록]] 그리고 [[침구 세탁]]');
  assert.deepEqual(titles, ['장보기 목록', '침구 세탁']);
});

test('rewrites unpublished wiki links to plain text', () => {
  const out = notes.rewriteWikiLinks('보기 [[비밀]] 끝', (title) => title);
  assert.equal(out, '보기 비밀 끝');
});

test('rewrites asset ids', () => {
  const id = '11111111-1111-1111-1111-111111111111';
  const out = notes.rewriteAssets('![x](moa-asset:' + id + ')', {
    [id]: 'https://example.test/img.jpg'
  });
  assert.equal(out, '![x](https://example.test/img.jpg)');
});
