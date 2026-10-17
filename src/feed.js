(() => {
  const PER = 12;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const grid = document.querySelector('.js-feed-index');
  const pag = document.querySelector('.js-feed-pagination');
  const heading = document.querySelector('.js-feed-heading');
  if (!grid || !pag) return;

  const HOME = document.documentElement.dataset.home || location.origin + '/';

  const labelMatch = location.pathname.match(/^\/search\/label\/([^/]+)/);
  const archiveMatch = location.pathname.match(/^\/(\d{4})(?:\/(\d{2}))?\/$/);
  const label = labelMatch ? decodeURIComponent(labelMatch[1]) : '';
  const query = new URLSearchParams(location.search).get('q') || '';

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

  const archiveTitle = () => {
    const [, y, m] = archiveMatch;
    return m ? `${y}年${+m}月の記事` : `${y}年の記事`;
  };
  const title = label ? label : query ? `“${query}” の検索結果` : archiveMatch ? archiveTitle() : '';
  const setHeading = count => {
    if (!heading) return;
    if (!title) { heading.remove(); return; }
    heading.textContent = '';
    const h = document.createElement('h1');
    h.textContent = title;
    heading.append(h);
    if (count != null) {
      const p = document.createElement('p');
      p.textContent = `${count} 件`;
      heading.append(p);
    }
  };
  setHeading(null);

  const cardHTML = p => {
    const url = p.link.find(l => l.rel === 'alternate').href;
    const thumb = (p.media$thumbnail?.url || '').replace(/\/s\d+[^/]*\//, '/s0/').replace(/=s\d+\S*$/, '=s0');
    const date = new Date(p.published.$t).toLocaleDateString('ja-JP');
    const labels = (p.category || []).map(c => `<a data-suisou-item='tag' href='${esc(HOME)}search/label/${encodeURIComponent(c.term)}'>${esc(c.term)}</a>`).join('');
    return `<article class='feed-card' data-suisou-tray=''>
      ${thumb ? `<img class='feed-card-image' src='${esc(thumb)}' loading='lazy' alt=''/>` : ''}
      <time class='feed-card-date' data-suisou-text='fs-12'>${date}</time>
      <h2 class='feed-card-title' data-suisou-text='fs-16 fw-500'><a class='feed-card-link' href='${esc(url)}'>${esc(p.title.$t)}</a></h2>
      ${labels ? `<p class='feed-card-labels'>${labels}</p>` : ''}
    </article>`;
  };
  const loadingHTML = `<progress class='feed-loading' aria-label='読み込み中'></progress>`;
  const emptyHTML = `<p class='feed-empty'>記事が見つかりませんでした。</p>`;

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
    return `<ul class='feed-pages-list'>` + pages.map(p =>
      p === null ? `<li><span aria-hidden='true'>…</span></li>`
      : p === n  ? `<li><a data-suisou-button='' href='${pageURL(p)}' aria-current='page'>${p}</a></li>`
      :            `<li><a data-suisou-button='' class='js-pg' data-page='${p}' href='${pageURL(p)}'>${p}</a></li>`
    ).join('') + '</ul>';
  };

  const loadPage = n => {
    grid.innerHTML = loadingHTML;
    grid.setAttribute('aria-busy', 'true');
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
    }).finally(() => grid.removeAttribute('aria-busy'));
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
