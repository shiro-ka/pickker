(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => c.querySelectorAll(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const HLJS = 'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/styles/';

  // テーマ切替
  const getTheme = () => {
    const v = localStorage.theme;
    return v === 'light' || v === 'dark' ? v : matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  };
  const applyTheme = t => {
    document.documentElement.dataset.theme = t;
    const hl = $('.js-hljs-theme');
    if (hl) hl.href = HLJS + (t === 'light' ? 'github.min.css' : 'github-dark.min.css');
  };
  $('.js-theme-toggle')?.addEventListener('click', () => {
    const t = getTheme() === 'dark' ? 'light' : 'dark';
    localStorage.theme = t;
    applyTheme(t);
  });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
    if (!localStorage.theme) applyTheme(e.matches ? 'light' : 'dark');
  });

  // モバイル shelf
  const shelf = $('.fixed-shelf');
  const overlay = $('.js-fixed-shelf-overlay');
  const setShelf = open => { shelf?.classList.toggle('is-open', open); overlay?.classList.toggle('is-open', open); };
  $('.js-shelf-toggle')?.addEventListener('click', () => setShelf(!shelf.classList.contains('is-open')));
  overlay?.addEventListener('click', () => setShelf(false));
  shelf?.addEventListener('click', e => { if (e.target.closest('a')) setShelf(false); });

  // タグ一覧ポップオーバー: 初回開時にサイドの .labels を複製
  const popover = $('.js-tag-list-popover');
  const setPopover = open => popover?.classList.toggle('is-open', open);
  $('.js-tag-list-toggle')?.addEventListener('click', e => {
    e.stopPropagation();
    const open = !popover.classList.contains('is-open');
    if (open && !popover.childElementCount) {
      const src = $('aside .labels');
      if (src) popover.innerHTML = src.innerHTML;
    }
    setPopover(open);
  });
  document.addEventListener('click', e => {
    if (popover?.classList.contains('is-open') && !popover.contains(e.target) && !e.target.closest('.js-tag-list-toggle')) setPopover(false);
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') { setShelf(false); setPopover(false); } });

  // 画像モーダル (本文の img クリックで拡大)
  const modal = $('.js-image-modal');
  if (modal) {
    document.addEventListener('click', e => {
      const t = e.target;
      if (t.tagName === 'IMG' && t.closest('.post-body')) {
        modal.querySelector('img').src = t.src.replace(/s\d{2,4}(-c)?/, 's1600');
        modal.showModal();
      }
    });
    modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  }

  // ヘッダー高さを CSS 変数に同期 (mobile sticky オフセット用)
  const titleRow = $('body > header nav > ul:first-child');
  const header = $('body > header');
  if (titleRow && header) {
    const update = () => header.style.setProperty('--hgroup-h', (titleRow.offsetHeight + parseFloat(getComputedStyle(header).paddingTop)) + 'px');
    new ResizeObserver(update).observe(titleRow);
    update();
  }

  // 外部ライブラリ依存処理は DCL 後に実行
  document.addEventListener('DOMContentLoaded', () => {
    renderMarkdown();
    buildTOC();
    setupTOCHighlight();
    loadLinkCards();
  });

  // markdown-it レンダリング (Blogger が勝手に付ける <p> を剥がしてから渡す)
  function renderMarkdown() {
    const el = $('.markdown');
    if (!el || !window.markdownit) return;
    // 非標準MD: breaks=true で単一改行も <br> 化 (標準に戻すなら breaks を外す)
    const md = window.markdownit({ html: true, breaks: true, linkify: true, typographer: true, langPrefix: 'hljs language-' })
      .use(window.markdownitEmoji);
    // 外部リンクに target/rel を付与 (旧 markdown-it-link-attributes の内製置換; v4 はブラウザ用UMD非同梱のため)
    const defaultLinkOpen = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
      const href = tokens[idx].attrGet('href');
      if (href && href.startsWith('http')) { tokens[idx].attrSet('target', '_blank'); tokens[idx].attrSet('rel', 'noopener noreferrer'); }
      return defaultLinkOpen(tokens, idx, options, env, self);
    };
    // Blogger は本文を <p> で包むので除去; textarea.innerHTML でエンティティを1段デコード
    const decode = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
    let src = decode(el.innerHTML.replace(/<p[^>]*>\s*/gi, '').replace(/\s*<\/p>/gi, '\n\n'));
    // 非標準MD: 連続空行を縦の余白として保持 (標準MDは潰す)。標準に戻すならこの行を消す。
    // 空行1個=通常の段落区切り、超過した空行1個につき <br> 1個。控えめにするなら length-3。
    src = src.replace(/\n{3,}/g, m => '\n\n' + '<br>\n\n'.repeat(m.length - 2));
    el.innerHTML = md.render(src);
    el.querySelectorAll('pre code').forEach(b => window.hljs?.highlightElement(b));
    window.twemoji?.parse(el, { base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@v14.0.2/assets/' });
  }

  // 目次ツリーを生成
  function buildTOC() {
    const body = $('.post-body');
    const nav = $('.content-toc > nav');
    if (!body || !nav) return;
    const headings = body.querySelectorAll('h2, h3, h4');
    if (!headings.length) return;
    const root = document.createElement('ul');
    const stack = [];
    headings.forEach((el, i) => {
      if (!el.id) el.id = 'toc-' + i;
      const level = +el.tagName[1];
      const li = document.createElement('li');
      li.innerHTML = `<a href='#${el.id}'>${esc(el.textContent.trim())}</a>`;
      while (stack.length && stack.at(-1).level >= level) stack.pop();
      if (!stack.length) root.appendChild(li);
      else {
        const parent = stack.at(-1).li;
        let sub = parent.querySelector('ul');
        if (!sub) { sub = document.createElement('ul'); parent.appendChild(sub); }
        sub.appendChild(li);
      }
      stack.push({ level, li });
    });
    nav.appendChild(root);
  }

  // スクロール位置で目次の現在地を aria-current でハイライト
  function setupTOCHighlight() {
    const nav = $('.content-toc > nav');
    if (!nav) return;
    const links = nav.querySelectorAll('a');
    const headings = $$('.post-body :is(h2, h3, h4)');
    if (!headings.length) return;
    let lastActive = null;
    addEventListener('scroll', () => {
      let currentId = null;
      headings.forEach(h => {
        if (scrollY >= h.getBoundingClientRect().top + scrollY - 225) currentId = h.id;
      });
      links.forEach(a => {
        const on = currentId && a.getAttribute('href') === '#' + currentId;
        a.toggleAttribute('aria-current', on);
        if (on && lastActive !== a) {
          lastActive = a;
          nav.scrollTo({ top: a.offsetTop - nav.clientHeight / 2, behavior: 'smooth' });
        }
      });
    });
  }

  // リンクカード (Microlink + localStorage キャッシュ + IO 遅延ロード)
  function loadLinkCards() {
    const KEY = 'ogp:', TTL = 7 * 864e5;
    const cache = {
      get(u) {
        try {
          const o = JSON.parse(localStorage.getItem(KEY + u) || 'null');
          if (!o || Date.now() - o.ts > TTL) { localStorage.removeItem(KEY + u); return null; }
          return o.data;
        } catch { return null; }
      },
      set(u, data) {
        const v = JSON.stringify({ ts: Date.now(), data });
        try { localStorage.setItem(KEY + u, v); }
        catch {
          Object.keys(localStorage).forEach(k => k.startsWith(KEY) && localStorage.removeItem(k));
          try { localStorage.setItem(KEY + u, v); } catch {}
        }
      }
    };
    const cardHTML = (href, d) => {
      let host = href;
      try { host = new URL(href).hostname; } catch {}
      return `<a class='link-card' href='${esc(href)}' target='_blank' rel='noopener noreferrer'>
        <div>
          <strong>${esc(d.title || href)}</strong>
          ${d.description ? `<small>${esc(d.description)}</small>` : ''}
          <small>${d.logo?.url ? `<img src='${esc(d.logo.url)}' alt='' onerror='this.style.display="none"'/>` : ''}${esc(host)}</small>
        </div>
        ${d.image?.url ? `<img src='${esc(d.image.url)}' alt='' loading='lazy'/>` : ''}
      </a>`;
    };
    const insert = (href, p, d) => {
      const tpl = document.createElement('template');
      tpl.innerHTML = cardHTML(href, d).trim();
      p.parentNode.insertBefore(tpl.content.firstElementChild, p.nextSibling);
    };
    const fetchCard = (href, p) => {
      const c = cache.get(href);
      if (c) return insert(href, p, c);
      fetch('https://api.microlink.io/?url=' + encodeURIComponent(href))
        .then(r => r.json())
        .then(j => { if (j.status === 'success') { cache.set(href, j.data); insert(href, p, j.data); } })
        .catch(() => {});
    };
    const targets = [];
    $$('.post-body a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href?.startsWith('http')) return;
      const p = a.closest('p');
      if (p) targets.push({ a, href, p });
    });
    const io = new IntersectionObserver((entries, ob) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        ob.unobserve(e.target);
        const t = e.target._lc;
        if (t) fetchCard(t.href, t.p);
      });
    }, { rootMargin: '1500px' });
    targets.forEach(t => { t.a._lc = t; io.observe(t.a); });
  }
})();
