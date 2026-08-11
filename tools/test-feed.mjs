#!/usr/bin/env node
// feed.js を最小の DOM スタブ上で走らせて、ビューごとに
// 「どのフィード URL を叩くか」「ページリンクがどう出るか」を確認する。
// ブラウザ無しで A-1 の核 (ラベル/検索/アーカイブの絞り込み) を検証するのが目的。

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const read = name => readFileSync(join(SRC, name), 'utf8');

const FEED = {
  feed: {
    'openSearch$totalResults': { $t: '30' },
    entry: [{
      link: [{ rel: 'alternate', href: 'https://example.com/2026/04/post.html' }],
      title: { $t: 'テスト記事' },
      published: { $t: '2026-04-01T00:00:00.000+09:00' },
      category: [{ term: 'Blogger' }],
      media$thumbnail: { url: 'https://img/s72-c/x.png' },
    }],
  },
};

function run(label, url) {
  const u = new URL(url);
  const requested = [];
  // textContent への代入は実 DOM だと子を全部消すので、そこまで再現する
  const el = () => {
    const n = {
      dataset: {}, innerHTML: '', kids: [], _text: '',
      addEventListener() {}, append(...c) { n.kids.push(...c); },
    };
    Object.defineProperty(n, 'textContent', {
      get: () => n._text,
      set: v => { n._text = v; n.kids.length = 0; },
    });
    return n;
  };
  const nodes = {
    '.js-feed-index': el(), '.js-feed-pagination': el(), '.js-feed-heading': el(),
  };
  const sandbox = {
    document: {
      documentElement: { dataset: { home: 'https://example.com/' } },
      querySelector: s => nodes[s] ?? null,
      createElement: () => el(),
    },
    location: { pathname: u.pathname, search: u.search, origin: u.origin, href: url },
    history: { pushState() {}, replaceState() {} },
    fetch: f => (requested.push(f), Promise.resolve({ json: () => Promise.resolve(FEED) })),
    URL, URLSearchParams, Date, Math, console,
    scrollTo() {}, addEventListener() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(read('feed.js'), sandbox);

  return new Promise(r => setTimeout(() => {
    console.log(`\n■ ${label}\n  URL     : ${url}`);
    console.log(`  feed    : ${decodeURIComponent(requested[0] || '(叩いてない)')}`);
    const h = nodes['.js-feed-heading'].kids.map(k => k.textContent).join(' / ');
    console.log(`  見出し  : ${h || '(なし)'}`);
    const links = [...nodes['.js-feed-pagination'].innerHTML.matchAll(/href='([^']*)'/g)].map(m => m[1]);
    console.log(`  ページ  : ${links.join(' , ') || '(なし)'}`);
    r();
  }, 10));
}

// 見出しは append 経由なので拾えるようにフックしておく
for (const [label, url] of [
  ['ホーム', 'https://example.com/'],
  ['ラベル', 'https://example.com/search/label/Blogger%20Tips'],
  ['検索', 'https://example.com/search?q=pico'],
  ['検索の2ページ目', 'https://example.com/search?q=pico&page=3'],
  ['月アーカイブ', 'https://example.com/2026/04/'],
  ['年アーカイブ', 'https://example.com/2026/'],
]) await run(label, url);
