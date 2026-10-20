(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => c.querySelectorAll(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  const sideNav = $('.js-side-nav');
  sideNav?.addEventListener('click', e => {
    if (e.target.closest('a') && sideNav.matches(':popover-open')) sideNav.hidePopover();
  });

  const bigImage = url => url
    .replace(/\/(?:s\d+|w\d+-h\d+)[-\w]*\/([^/]+)$/, '/s1600/$1')
    .replace(/=(?:s\d+|w\d+-h\d+)[-\w]*$/, '=s1600');
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
      }).use(window.markdownitEmoji);
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
    return window.twemoji ? window.twemoji.parse(html, { base: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@v14.0.2/assets/' }) : html;
  }

  function renderMarkdown() {
    const el = $('.js-post-body');
    if (!el || !window.markdownit) return;
    const decode = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
    let src = decode(el.innerHTML.replace(/<p[^>]*>\s*/gi, '').replace(/\s*<\/p>/gi, '\n\n'));
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
      return `<div class='link-card' data-suisou-item=''>
        <a data-suisou-item='media' href='${esc(href)}' target='_blank' rel='noopener noreferrer'>
          <span data-suisou-item='media-content'>
            <header><span data-suisou-text='clamp-2'>${esc(d.title || href)}</span><span class='link-card-host'>${d.logo?.url ? `<img src='${esc(d.logo.url)}' alt='' onerror='this.remove()'/>` : ''}${esc(host)}</span></header>
            ${d.description ? `<span data-suisou-text='fs-12 clamp-2'>${esc(d.description)}</span>` : ''}
          </span>
          ${d.image?.url ? `<img class='link-card-image' data-suisou-item='media-tail' src='${esc(d.image.url)}' alt='' loading='lazy'/>` : ''}
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
