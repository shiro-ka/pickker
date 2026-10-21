(() => {
  const HOME = document.documentElement.dataset.home || location.origin + '/';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pathOf = href => { try { return new URL(href, location.href).pathname; } catch { return href; } };
  const shown = new Set([location.pathname]);

  document.querySelectorAll('.js-popular-item').forEach(li => {
    if (shown.has(pathOf(li.querySelector('a')?.href || ''))) li.remove();
  });
  const popular = document.querySelector('.js-popular-item a');
  if (popular) shown.add(pathOf(popular.href));

  const label = document.querySelector('.js-post-labels a')?.textContent.trim();
  const latestSlot = document.querySelector('.js-latest-post');
  const randomSlot = document.querySelector('.js-random-post');
  if (!label || (!latestSlot && !randomSlot)) return;

  fetch(HOME + 'feeds/posts/summary/-/' + encodeURIComponent(label) + '?alt=json&max-results=10')
    .then(r => r.json())
    .then(data => {
      const posts = (data.feed?.entry || [])
        .map(p => {
          const link = p.link.find(l => l.rel === 'alternate')?.href;
          return link ? { link, title: p.title.$t, thumb: p.media$thumbnail?.url || '' } : null;
        })
        .filter(p => p && !shown.has(pathOf(p.link)));
      if (!posts.length) return;
      const render = (p, target) => {
        target.innerHTML = `<a class='side-post' data-suisou-item='media' href='${esc(p.link)}'>${p.thumb ? `<img alt='' class='side-post-image' data-suisou-item='media-figure square large' src='${esc(p.thumb)}'/>` : ''}<span data-suisou-item='media-content'><span data-suisou-text='clamp-2'>${esc(p.title)}</span></span></a>`;
      };
      if (latestSlot) render(posts[0], latestSlot);
      const rest = posts.slice(1);
      if (randomSlot && rest.length) render(rest[Math.floor(Math.random() * rest.length)], randomSlot);
    })
    .catch(() => {});
})();
