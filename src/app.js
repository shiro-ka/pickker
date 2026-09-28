(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => c.querySelectorAll(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const HLJS = 'https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11/styles/';
  // OS が「視差効果を減らす」設定ならスムーススクロールを切る
  const motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

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
  const shelfBtn = $('.js-shelf-toggle');
  const setShelf = open => {
    shelf?.classList.toggle('is-open', open);
    overlay?.classList.toggle('is-open', open);
    shelfBtn?.setAttribute('aria-expanded', String(open));
  };
  shelfBtn?.addEventListener('click', () => setShelf(!shelf.classList.contains('is-open')));
  overlay?.addEventListener('click', () => setShelf(false));
  shelf?.addEventListener('click', e => { if (e.target.closest('a')) setShelf(false); });

  // タグ一覧ポップオーバー: 初回開時にサイドの .labels を複製
  const popover = $('.js-tag-list-popover');
  const tagBtn = $('.js-tag-list-toggle');
  const setPopover = open => {
    popover?.classList.toggle('is-open', open);
    tagBtn?.setAttribute('aria-expanded', String(open));
  };
  tagBtn?.addEventListener('click', e => {
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
  // Blogger の画像 URL からサイズ指定を探して原寸寄りに差し替える。指定の形は2系統ある:
  //   .../s320/name.png や .../w1200-h630-p-k-no-nu/name.png  (パスの後ろから2番目)
  //   ...=s320 や ...=w640-h480-p-k-no-nu                      (末尾のサフィックス)
  // 区切りまで含めて判定しないと、サイズ指定の無い URL でファイル名の中の "s123" を
  // 拾ってしまい (例: screenshots1234.png → screenshots1600.png) 404 になる。
  const bigImage = url => url
    .replace(/\/(?:s\d+|w\d+-h\d+)[-\w]*\/([^/]+)$/, '/s1600/$1')
    .replace(/=(?:s\d+|w\d+-h\d+)[-\w]*$/, '=s1600');
  const modal = $('.js-image-modal');
  if (modal) {
    document.addEventListener('click', e => {
      const t = e.target;
      if (t.tagName === 'IMG' && t.closest('.post-body')) {
        modal.querySelector('img').src = bigImage(t.src);
        modal.showModal();
      }
    });
    modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  }

  // ヘッダー高さを CSS 変数に同期 (mobile sticky オフセット用)
  // 変数は html に立てる。header に立てると、兄弟である .tag-list-popover へ継承されず
  // フォールバック値 (96px) のままになる。
  const titleRow = $('body > header nav > ul:first-child');
  const header = $('body > header');
  if (titleRow && header) {
    const update = () => document.documentElement.style.setProperty('--hgroup-h', (titleRow.offsetHeight + parseFloat(getComputedStyle(header).paddingTop)) + 'px');
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
  //
  // 旧実装は scroll のたびに全見出しへ getBoundingClientRect していたので、
  // スクロール中ずっと強制レイアウトが走っていた。IntersectionObserver に置き換えて
  // 「画面上端から LINE px のラインを見出しが越えたか」だけを持つ形にしてある。
  // 判定条件 (rect.top <= LINE) は旧実装と同じなので見た目の挙動は変わらない。
  function setupTOCHighlight() {
    const nav = $('.content-toc > nav');
    if (!nav) return;
    const links = [...nav.querySelectorAll('a')];
    const headings = [...$$('.post-body :is(h2, h3, h4)')];
    if (!headings.length) return;
    const LINE = 225;
    const passed = new Map();
    let lastActive = null;

    const update = () => {
      let current = null;
      headings.forEach(h => { if (passed.get(h)) current = h; });
      links.forEach(a => {
        const on = !!current && a.getAttribute('href') === '#' + current.id;
        a.toggleAttribute('aria-current', on);
        if (on && lastActive !== a) {
          lastActive = a;
          nav.scrollTo({ top: a.offsetTop - nav.clientHeight / 2, behavior: motion });
        }
      });
    };
    // rootMargin で上端を LINE px 下げた枠を作る。枠から出た = ラインを越えた。
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => passed.set(e.target, e.boundingClientRect.top <= LINE));
      update();
    }, { rootMargin: `-${LINE}px 0px 0px 0px` });
    headings.forEach(h => io.observe(h));
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
      // 段落がそのリンク単体で出来ているときだけカード化する。
      // 文中に貼ったリンクにまでカードが生えると読めたものではないし、
      // Microlink の無料枠 (公開エンドポイントで 1日50リクエスト) も一瞬で枯れる。
      if (p && p.children.length === 1 && p.firstElementChild === a && p.textContent.trim() === a.textContent.trim()) {
        targets.push({ a, href, p });
      }
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
