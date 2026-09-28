// 一覧ページ (ホーム / ラベル / 検索 / アーカイブ) を Feed API から描画する。
//
// Blogger の data:blog.pageType はこの4つを全部 "index" と返すので、テンプレート側では
// 区別できない。どのビューかは URL から判定する:
//   /search/label/<label>  ラベル
//   /search?q=<query>      検索
//   /YYYY/MM/ , /YYYY/     アーカイブ
//   それ以外               ホーム
(() => {
  const PER = 12;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  const grid = document.querySelector('.js-feed-index');
  const pag = document.querySelector('.js-feed-pagination');
  const heading = document.querySelector('.js-feed-heading');
  if (!grid || !pag) return;

  const HOME = document.documentElement.dataset.home || location.origin + '/';

  // --- 今どのビューか ---
  const labelMatch = location.pathname.match(/^\/search\/label\/([^/]+)/);
  const archiveMatch = location.pathname.match(/^\/(\d{4})(?:\/(\d{2}))?\/$/);
  const label = labelMatch ? decodeURIComponent(labelMatch[1]) : '';
  const query = new URLSearchParams(location.search).get('q') || '';

  // --- フィード URL ---
  // ラベルはパスで、検索は q= で、アーカイブは published-min/max で絞る。
  const feedURL = n => {
    const base = HOME + 'feeds/posts/summary' + (label ? '/-/' + encodeURIComponent(label) : '');
    const p = new URLSearchParams({ alt: 'json', 'max-results': PER, 'start-index': (n - 1) * PER + 1 });
    if (query) p.set('q', query);
    if (archiveMatch) {
      const [, y, m] = archiveMatch;
      const from = m ? new Date(Date.UTC(+y, +m - 1, 1)) : new Date(Date.UTC(+y, 0, 1));
      const to = m ? new Date(Date.UTC(+y, +m, 1)) : new Date(Date.UTC(+y + 1, 0, 1));
      const iso = d => d.toISOString().replace(/\.\d+Z$/, '');
      p.set('published-min', iso(from));
      p.set('published-max', iso(to));
    }
    return base + '?' + p;
  };

  const cache = {};
  const fetchPage = n => cache[n] ??= fetch(feedURL(n)).then(r => r.json());

  // --- 見出し ---
  const archiveTitle = () => {
    const [, y, m] = archiveMatch;
    return m ? `${y}年${+m}月の記事` : `${y}年の記事`;
  };
  const title = label ? label : query ? `“${query}” の検索結果` : archiveMatch ? archiveTitle() : '';
  const setHeading = count => {
    if (!heading || !title) return;
    heading.textContent = '';
    const h = document.createElement('h2');
    h.textContent = title;
    heading.append(h);
    if (count != null) {
      const p = document.createElement('p');
      p.textContent = `${count} 件`;
      heading.append(p);
    }
  };
  setHeading(null);

  // --- カード ---
  const cardHTML = p => {
    const url = p.link.find(l => l.rel === 'alternate').href;
    const thumb = (p.media$thumbnail?.url || '').replace(/\/s\d+[^/]*\//, '/s0/').replace(/=s\d+\S*$/, '=s0');
    const date = new Date(p.published.$t).toLocaleDateString('ja-JP');
    const labels = (p.category || []).map(c => `<a data-suisou-tag='accent' href='${esc(HOME)}search/label/${encodeURIComponent(c.term)}'>${esc(c.term)}</a>`).join('');
    // 面と罫は Suisou の panel (bleed: 余白は中身が持つ)。preview/index.html にも同じ構造の写しがある
    return `<article data-suisou-surface='panel bleed'><a href='${esc(url)}'></a>${thumb ? `<figure><img src='${esc(thumb)}' loading='lazy' alt=''/></figure>` : ''}<header><time>${date}</time><p>${esc(p.title.$t)}</p></header><footer><div class='labels'>${labels}</div></footer></article>`;
  };
  const skeletonHTML = `<article class='js-skeleton-card' data-suisou-surface='panel bleed'><figure><span data-suisou-spinner='' role='status' aria-label='読み込み中'></span></figure><header><time>0000/00/00</time><p>　</p></header><footer></footer></article>`;
  const emptyHTML = `<p class='feed-empty'>記事が見つかりませんでした。</p>`;

  // --- ページネーション ---
  // ラベルや検索クエリを落とさないよう、現在の URL に page だけ足し引きする。
  const pageURL = n => {
    const p = new URLSearchParams(location.search);
    n === 1 ? p.delete('page') : p.set('page', n);
    const q = p.toString();
    return location.pathname + (q ? '?' + q : '');
  };
  const pagHTML = (n, total) => {
    if (total <= 1) return '';
    const lo = Math.max(2, n - 1), hi = Math.min(total - 1, n + 1);
    const pages = [1];
    if (lo > 2) pages.push(null);
    for (let i = lo; i <= hi; i++) pages.push(i);
    if (hi < total - 1) pages.push(null);
    pages.push(total);
    return '<ul>' + pages.map(p =>
      p === null ? `<li><span aria-hidden='true'>…</span></li>`
      : p === n  ? `<li><a data-suisou-button='' href='${pageURL(p)}' aria-current='page'>${p}</a></li>`
      :            `<li><a data-suisou-button='' class='js-pg' data-page='${p}' href='${pageURL(p)}'>${p}</a></li>`
    ).join('') + '</ul>';
  };

  const loadPage = n => {
    grid.innerHTML = skeletonHTML.repeat(PER);
    fetchPage(n).then(data => {
      const entries = data.feed.entry || [];
      const total = +data.feed['openSearch$totalResults'].$t;
      const totalPages = Math.ceil(total / PER);
      setHeading(total);
      grid.innerHTML = entries.length ? entries.map(cardHTML).join('') : emptyHTML;
      pag.innerHTML = pagHTML(n, totalPages);
      if (n > 1) fetchPage(n - 1);
      if (n < totalPages) fetchPage(n + 1);
    }).catch(() => {
      grid.innerHTML = emptyHTML;
      pag.innerHTML = '';
    });
  };
  const go = n => { history.pushState({ page: n }, '', pageURL(n)); loadPage(n); scrollTo(0, 0); };

  pag.addEventListener('mouseover', e => {
    const a = e.target.closest('.js-pg');
    if (a) fetchPage(+a.dataset.page);
  });
  pag.addEventListener('click', e => {
    const a = e.target.closest('.js-pg');
    if (!a) return;
    e.preventDefault();
    go(+a.dataset.page);
  });
  addEventListener('popstate', e => { loadPage(e.state?.page || 1); scrollTo(0, 0); });

  const cur = +new URLSearchParams(location.search).get('page') || 1;
  history.replaceState({ page: cur }, '');
  loadPage(cur);
})();
