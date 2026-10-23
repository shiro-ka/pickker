(() => {
  const here = new URL(location.href);
  if (here.searchParams.has('m')) {
    here.searchParams.delete('m');
    history.replaceState(history.state, '', here);
  }
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => c.querySelectorAll(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  const theme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  $('.js-theme-toggle')?.addEventListener('click', () => {
    const t = theme() === 'dark' ? 'light' : 'dark';
    const apply = () => { document.documentElement.dataset.theme = t; };
    if (motion === 'smooth' && document.startViewTransition) document.startViewTransition(apply);
    else apply();
    try { localStorage.theme = t; } catch {}
  });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
    let saved;
    try { saved = localStorage.theme; } catch {}
    if (!saved) document.documentElement.dataset.theme = e.matches ? 'light' : 'dark';
  });
  const sideNav = $('.js-side-nav');
  sideNav?.addEventListener('click', e => {
    if (e.target.closest('a') && sideNav.matches(':popover-open')) sideNav.hidePopover();
  });

  const bigImage = url => url
    .replace(/\/(?:s\d+|w\d+-h\d+)[-\w]*\/([^/]+)$/, '/s0/$1')
    .replace(/=(?:s\d+|w\d+-h\d+)[-\w]*$/, '=s0');
  const BLOGGER_IMAGE = /^https:\/\/(?:blogger\.googleusercontent\.com|[\w-]+\.bp\.blogspot\.com)\//;
  const normalizeBloggerImages = src => src
    .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>\s*(?:<span\b[^>]*>\s*)?(<img\b[^>]*>)\s*(?:<\/span>\s*)?<\/a>/gi,
      (all, href, img) => BLOGGER_IMAGE.test(href) ? img : all)
    .replace(/<div\b[^>]*\bclass="separator"[^>]*>\s*(?:<span\b[^>]*>\s*)?(<img\b[^>]*>)\s*(?:<\/span>\s*)?<\/div>/gi, '$1')
    .replace(/<img\b[^>]*>/gi, img => {
      const url = (img.match(/\bsrc="([^"]*)"/i) || [])[1];
      if (!url || !BLOGGER_IMAGE.test(url)) return img;
      const alt = (img.match(/\balt="([^"]*)"/i) || [])[1] || '';
      return `<img src="${bigImage(url)}" alt="${alt}" loading="lazy">`;
    });
  const modal = $('.js-image-modal');
  if (modal) {
    document.addEventListener('click', e => {
      const t = e.target;
      if (t.tagName === 'IMG' && !t.classList.contains('emoji') && t.closest('.js-post-body') && !t.closest('a')) {
        modal.querySelector('img').src = bigImage(t.src);
        modal.showModal();
      }
    });
    modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderMarkdown();
    buildTOC();
    setupTOCHighlight();
    loadLinkCards();
  });

  const embedOf = href => {
    let u;
    try { u = new URL(href); } catch { return null; }
    const host = u.hostname.replace(/^(www|m)\./, '');
    if (host === 'youtu.be' || host === 'youtube.com' || host === 'music.youtube.com') {
      const id = host === 'youtu.be' ? u.pathname.slice(1)
        : u.pathname === '/watch' ? u.searchParams.get('v')
        : (u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/) || [])[1];
      if (!id || !/^[\w-]+$/.test(id)) return null;
      const t = u.searchParams.get('t') || u.searchParams.get('start') || '';
      const hms = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
      const start = hms ? (+(hms[1] || 0)) * 3600 + (+(hms[2] || 0)) * 60 + (+(hms[3] || 0)) : 0;
      return `<div class='embed embed-youtube'><iframe src='https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}' title='YouTube' loading='lazy' allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share' referrerpolicy='strict-origin-when-cross-origin' allowfullscreen></iframe></div>`;
    }
    if (host === 'open.spotify.com') {
      const m = u.pathname.match(/^\/(?:intl-[\w-]+\/)?(track|album|playlist|artist|episode|show)\/(\w+)/);
      if (!m) return null;
      const height = m[1] === 'track' || m[1] === 'episode' ? 152 : 352;
      return `<div class='embed embed-spotify'><iframe src='https://open.spotify.com/embed/${m[1]}/${m[2]}' title='Spotify' height='${height}' loading='lazy' allow='autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'></iframe></div>`;
    }
    if (host === 'soundcloud.com' && u.pathname.split('/').filter(Boolean).length >= 1) {
      return `<div class='embed embed-soundcloud'><iframe src='https://w.soundcloud.com/player/?url=${encodeURIComponent(u.origin + u.pathname)}&amp;visual=true' title='SoundCloud' height='300' loading='lazy' allow='autoplay; encrypted-media'></iframe></div>`;
    }
    return null;
  };

  const CJK = [
    [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff],
    [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe10, 0xfe19],
    [0xfe30, 0xfe6f], [0xff00, 0xffef], [0x16fe0, 0x18aff], [0x1b000, 0x1b2ff], [0x1f200, 0x1f2ff],
    [0x20000, 0x3fffd],
  ];
  const isCjk = c => CJK.some(([from, to]) => from <= c && c <= to) && !/\p{Emoji_Presentation}/u.test(String.fromCodePoint(c));
  const cjkEmphasis = md => {
    const { isWhiteSpace, isMdAsciiPunct, isPunctChar } = md.utils;
    const punct = c => isMdAsciiPunct(c) || isPunctChar(String.fromCodePoint(c));
    md.inline.State = class extends md.inline.State {
      scanDelims(start, canSplitWord) {
        const marker = this.src.charCodeAt(start);
        let pos = start;
        while (pos < this.posMax && this.src.charCodeAt(pos) === marker) pos++;
        const length = pos - start;
        const before = start > 0 ? [...this.src.slice(Math.max(0, start - 2), start)].pop().codePointAt(0) : 0x20;
        const after = pos < this.posMax ? this.src.codePointAt(pos) : 0x20;
        if (isWhiteSpace(before) || isWhiteSpace(after)) return { can_open: !isWhiteSpace(after), can_close: !isWhiteSpace(before), length };
        const cjk = canSplitWord && (isCjk(before) || isCjk(after));
        return {
          can_open: punct(before) || (canSplitWord && (cjk || !punct(after))),
          can_close: punct(after) || (canSplitWord && (cjk || !punct(before))),
          length,
        };
      }
    };
  };

  let md;
  function markdownToHTML(src) {
    if (!md) {
      md = window.markdownit({
        html: true, breaks: true, linkify: true, typographer: true, langPrefix: 'hljs language-',
        highlight: (code, lang) => {
          if (!window.hljs) return '';
          if (lang && window.hljs.getLanguage(lang)) return window.hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
          return lang ? '' : window.hljs.highlightAuto(code).value;
        },
      }).use(window.markdownitEmoji).use(cjkEmphasis);
      if (window.markdownitDeflist) md.use(window.markdownitDeflist);
      if (window.markdownitContainer) {
        md.use(window.markdownitContainer, 'details', {
          validate: params => /^details(\s|$)/.test(params.trim()),
          render: (tokens, idx) => {
            if (tokens[idx].nesting !== 1) return '</details>\n';
            const title = tokens[idx].info.trim().replace(/^details\s*/, '') || '詳細';
            return `<details><summary>${md.utils.escapeHtml(title)}</summary>\n`;
          },
        });
        md.use(window.markdownitContainer, 'message', {
          validate: params => /^message(\s|$)/.test(params.trim()),
          render: (tokens, idx) => {
            if (tokens[idx].nesting !== 1) return '</div>\n';
            const alert = /^message\s+alert\b/.test(tokens[idx].info.trim());
            return `<div class='notice${alert ? ' notice-alert' : ''}'>\n`;
          },
        });
      }
      md.core.ruler.push('embed', state => {
        const t = state.tokens;
        for (let i = 0; i + 2 < t.length; i++) {
          if (t[i].type !== 'paragraph_open' || t[i + 1].type !== 'inline' || t[i + 2].type !== 'paragraph_close') continue;
          const c = t[i + 1].children || [];
          if (c.length !== 3 || c[0].type !== 'link_open' || c[2].type !== 'link_close') continue;
          const href = c[0].attrGet('href');
          if (c[1].content.trim() !== href) continue;
          const html = embedOf(href);
          if (!html) continue;
          const block = new state.Token('html_block', '', 0);
          block.content = html + '\n';
          t.splice(i, 3, block);
        }
      });
      const defaultLinkOpen = md.renderer.rules.link_open || ((t, i, o, e, s) => s.renderToken(t, i, o));
      md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const href = tokens[idx].attrGet('href');
        if (href && href.startsWith('http')) {
          tokens[idx].attrSet('target', '_blank');
          tokens[idx].attrSet('rel', 'noopener noreferrer');
        }
        return defaultLinkOpen(tokens, idx, options, env, self);
      };
      const defaultFence = md.renderer.rules.fence;
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        const m = token.info.trim().match(/^([^\s:]*):(\S+)(.*)$/);
        if (!m) return defaultFence(tokens, idx, options, env, self);
        token.info = m[1] + m[3];
        return `<figure><figcaption>${md.utils.escapeHtml(m[2])}</figcaption>${defaultFence(tokens, idx, options, env, self)}</figure>\n`;
      };
    }
    const html = md.render(src);
    return window.twemoji ? window.twemoji.parse(html, { base: 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/' }) : html;
  }

  function renderMarkdown() {
    const el = $('.js-post-body');
    if (!el || !window.markdownit) return;
    const decode = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
    let src = normalizeBloggerImages(decode(el.innerHTML.replace(/<p[^>]*>\s*/gi, '').replace(/\s*<\/p>/gi, '\n\n')));
    src = src.replace(/\n{3,}/g, m => '\n\n' + '<br>\n\n'.repeat(m.length - 2));
    el.innerHTML = markdownToHTML(src);
  }

  function buildTOC() {
    const body = $('.js-post-body');
    const toc = $('.js-toc');
    if (!body || !toc) return;
    const headings = body.querySelectorAll('h2, h3, h4');
    if (!headings.length) {
      $('.js-side-toc')?.remove();
      return;
    }
    const stack = [];
    headings.forEach((el, i) => {
      if (!el.id) el.id = 'toc-' + i;
      const level = +el.tagName[1];
      const li = document.createElement('li');
      li.innerHTML = `<a href='#${el.id}'>${esc(el.textContent.trim())}</a>`;
      while (stack.length && stack.at(-1).level >= level) stack.pop();
      if (!stack.length) toc.append(li);
      else {
        const parent = stack.at(-1).li;
        let sub = parent.querySelector(':scope > ul');
        if (!sub) { sub = document.createElement('ul'); parent.append(sub); }
        sub.append(li);
      }
      stack.push({ level, li });
    });
  }

  function setupTOCHighlight() {
    const toc = $('.js-toc');
    if (!toc) return;
    const links = [...toc.querySelectorAll('a')];
    const headings = [...$$('.js-post-body :is(h2, h3, h4)')];
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
          const offset = a.getBoundingClientRect().top - toc.getBoundingClientRect().top - toc.clientHeight / 2;
          toc.scrollBy({ top: offset, behavior: motion });
        }
      });
    };
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => passed.set(e.target, e.boundingClientRect.top <= LINE));
      update();
    }, { rootMargin: `-${LINE}px 0px 0px 0px` });
    headings.forEach(h => io.observe(h));
  }

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
      return `<div class='link-card'>
        <a class='media' href='${esc(href)}' target='_blank' rel='noopener noreferrer'>
          <span class='media-content'>
            <header><span class='clamp-2'>${esc(d.title || href)}</span><span class='link-card-host'>${d.logo?.url ? `<img src='${esc(d.logo.url)}' alt='' onerror='this.remove()'/>` : ''}${esc(host)}</span></header>
            ${d.description ? `<span class='link-card-description clamp-2'>${esc(d.description)}</span>` : ''}
          </span>
          ${d.image?.url ? `<img class='link-card-image media-tail' src='${esc(d.image.url)}' alt='' loading='lazy'/>` : ''}
        </a>
      </div>`;
    };
    const insert = (href, p, d) => {
      const tpl = document.createElement('template');
      tpl.innerHTML = cardHTML(href, d).trim();
      p.after(tpl.content.firstElementChild);
    };
    const fetchCard = (href, p) => {
      const c = cache.get(href);
      if (c) return insert(href, p, c);
      fetch('https://api.microlink.io/?url=' + encodeURIComponent(href))
        .then(r => r.json())
        .then(j => { if (j.status === 'success') { cache.set(href, j.data); insert(href, p, j.data); } })
        .catch(() => {});
    };
    const targets = new Map();
    $$('.js-post-body a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (!href?.startsWith('http')) return;
      const p = a.closest('p');
      if (p && p.children.length === 1 && p.firstElementChild === a && p.textContent.trim() === a.textContent.trim()) {
        targets.set(a, { href, p });
      }
    });
    const io = new IntersectionObserver((entries, ob) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        ob.unobserve(e.target);
        const t = targets.get(e.target);
        if (t) fetchCard(t.href, t.p);
      });
    }, { rootMargin: '1500px' });
    targets.forEach((_, a) => io.observe(a));
  }
})();
