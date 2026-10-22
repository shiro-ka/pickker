(() => {
  const HOME = document.documentElement.dataset.home || location.origin + '/';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pathOf = href => { try { return new URL(href, location.href).pathname; } catch { return href; } };
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const shown = new Set([location.pathname]);

  document.querySelectorAll('.js-popular-item').forEach(li => {
    if (shown.has(pathOf(li.querySelector('a')?.href || ''))) li.remove();
  });
  const popular = document.querySelector('.js-popular-item a');
  if (popular) shown.add(pathOf(popular.href));

  const labelSlot = document.querySelector('.js-label-post');
  const blogSlot = document.querySelector('.js-random-post');
  if (!labelSlot && !blogSlot) return;
  const all = [...document.querySelectorAll('.js-post-labels a')].map(a => a.textContent.trim()).filter(Boolean);
  const first = pick(all);
  const labels = all.length ? [first, ...all.filter(l => l !== first)] : [];

  const feed = path => fetch(HOME + 'feeds/posts/summary' + path + '?alt=json&max-results=20')
    .then(r => r.json())
    .then(data => (data.feed?.entry || [])
      .map(p => {
        const link = p.link.find(l => l.rel === 'alternate')?.href;
        return link ? { link, title: p.title.$t, thumb: p.media$thumbnail?.url || '' } : null;
      })
      .filter(Boolean))
    .catch(() => []);
  const fresh = posts => posts.filter(p => !shown.has(pathOf(p.link)));
  const render = (p, target) => {
    shown.add(pathOf(p.link));
    target.innerHTML = `<a class='side-post' data-suisou-item='media' href='${esc(p.link)}'>${p.thumb ? `<img alt='' class='side-post-image' data-suisou-item='media-figure square large' src='${esc(p.thumb)}'/>` : ''}<span data-suisou-item='media-content'><span data-suisou-text='clamp-2'>${esc(p.title)}</span></span></a>`;
  };

  const blogPosts = blogSlot ? feed('') : null;
  (async () => {
    if (labelSlot) {
      for (const label of labels) {
        const posts = fresh(await feed('/-/' + encodeURIComponent(label)));
        if (posts.length) { render(pick(posts), labelSlot); break; }
      }
    }
    if (blogSlot) {
      const posts = fresh(await blogPosts);
      if (posts.length) render(pick(posts), blogSlot);
    }
  })();
})();
