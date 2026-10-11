/* ریحانه فرزانه — site engine */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const isMobile = () => innerWidth <= 820;
  const FA = (n) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  const hasGSAP = typeof window.gsap !== 'undefined';
  if (hasGSAP) { gsap.registerPlugin(ScrollTrigger); ScrollTrigger.config({ ignoreMobileResize: true }); }

  // iOS fires 'resize' every time the address bar slides in or out while you scroll.
  // Re-measuring then shifts the page under your finger and kills momentum, so only a
  // real WIDTH change (rotation, window resize) is allowed to re-lay anything out.
  const resizeFns = new Set();
  let lastW = innerWidth;
  window.addEventListener('resize', () => {
    if (innerWidth === lastW) return;
    lastW = innerWidth;
    resizeFns.forEach((fn) => fn());
  });
  const onResize = (fn) => resizeFns.add(fn);
  const offResize = (fn) => resizeFns.delete(fn);

  /* ═════════ Kashida: the calligrapher's stretch ═════════
     Joints are where a letter connects to the next; the stretch is extra tatweels
     typed into the word at those joints, never markup. */
  const TATWEEL = 'ـ';
  const JOINS_LEFT = new Set([...'بپتثجچحخسشصضطظعغفقکگلمنهیئيك']);
  const LETTER = /[ء-يٮ-ۓۺ-ۿ]/;

  function autoJoints(text) {
    const out = [];
    let start = 0;
    for (let k = 0; k <= text.length; k++) {
      const c = text[k];
      if (k === text.length || c === ' ' || c === '‌') {
        let best = -1;
        for (let j = start; j < k - 1; j++) {
          const a = text[j], b = text[j + 1];
          if (!JOINS_LEFT.has(a) || !LETTER.test(b)) continue;
          if (a === 'ل' && 'اآأإ'.includes(b)) continue; // keep lam-alef whole
          best = j;
        }
        if (best >= 0 && k - start >= 3) out.push(best);
        start = k + 1;
      }
    }
    return out;
  }

  class Kashida {
    // The word is cut at each joint into self-contained pieces that END (or start) in a
    // tatweel — «پـ» + «ـل». A tatweel tells every engine, Safari included, which form
    // the neighbouring letter takes, so each piece is shaped correctly on its own.
    // Between pieces sits a flat bar cut to the tatweel's exact stroke; its width is
    // continuous, so the stretch grows smoothly, pixel by pixel, in both directions.
    constructor(el) {
      this.el = el;
      this.text = el.dataset.kx;
      this.joints = (el.dataset.joints ? el.dataset.joints.split(',').map(Number) : autoJoints(this.text)).sort((a, b) => a - b);
      el.textContent = '';
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = this.text;
      this.vis = document.createElement('span');
      this.vis.className = 'kx-in';
      this.vis.setAttribute('aria-hidden', 'true');
      this.segs = [];
      this.bars = [];
      let last = 0;
      // each piece's helper tatweel is clipped off at the letter's own joining point,
      // so at rest the pieces meet exactly where the font would join them natively
      const seg = (s, cutR, cutL) => {
        const e = document.createElement('span');
        e.className = 'kseg' + (cutR ? ' cut-r' : '') + (cutL ? ' cut-l' : '');
        e.textContent = s;
        this.vis.append(e);
        this.segs.push(e);
      };
      this.joints.forEach((j, i) => {
        seg((i ? TATWEEL : '') + this.text.slice(last, j + 1) + TATWEEL, i > 0, true);
        const bar = document.createElement('span');
        bar.className = 'kbar';
        this.vis.append(bar);
        this.bars.push(bar);
        last = j + 1;
      });
      seg((this.joints.length ? TATWEEL : '') + this.text.slice(last), this.joints.length > 0, false);
      el.append(sr, this.vis);
      this.len = 0;
      this.tw = 0;
    }
    measure() {
      const cs = getComputedStyle(this.el);
      this.fs = parseFloat(cs.fontSize);
      const c = Kashida.ctx || (Kashida.ctx = document.createElement('canvas').getContext('2d'));
      c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = c.measureText(TATWEEL);
      this.tw = m.width;
      this.vis.style.setProperty('--tw', this.tw.toFixed(2) + 'px');
      this.asc = m.actualBoundingBoxAscent;
      this.vis.style.setProperty('--kb', (-m.actualBoundingBoxDescent).toFixed(2) + 'px');
      this.vis.style.setProperty('--kh', (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent).toFixed(2) + 'px');
      // where the tatweel's stroke sits inside a piece's box: the clip removes only that
      // thin band at the joint, so dots and descenders hanging under it stay whole
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      this.segs[0].append(probe);
      const base = probe.getBoundingClientRect().top - this.segs[0].getBoundingClientRect().top;
      probe.remove();
      const yt = base - m.actualBoundingBoxAscent - 1.5, yb = base + m.actualBoundingBoxDescent + 1.5;
      this.vis.style.setProperty('--yt', yt.toFixed(2) + 'px');
      this.vis.style.setProperty('--yb', yb.toFixed(2) + 'px');
      const keep = this.len;
      this.setLen(0);
      this.natural = this.vis.getBoundingClientRect().width;
      this.setLen(keep);
      return this;
    }
    // total extra length in px, shared across the joints
    setLen(px) {
      this.len = Math.max(0, px);
      const per = this.len / (this.bars.length || 1);
      this.bars.forEach((b) => {
        b.style.width = per.toFixed(2) + 'px';
        b.classList.toggle('is-rest', per < 0.5);
      });
    }
    // the open stretch between the pieces either side of joint i
    gapRect(i = 0) {
      const a = this.segs[i].getBoundingClientRect(), b = this.segs[i + 1].getBoundingClientRect();
      const left = b.right - this.tw, right = a.left + this.tw;
      return { left, right, width: Math.max(0, right - left), top: a.top, bottom: a.bottom };
    }
  }

  // shrink a display word only if it would overflow its box
  function fitWidth(host, words, avail, widthOf) {
    host.style.fontSize = '';
    words.forEach((w) => w.measure());
    const need = widthOf();
    if (need > avail && need > 0) {
      host.style.fontSize = (words[0].fs * (avail / need) * 0.985).toFixed(2) + 'px';
      words.forEach((w) => w.measure());
    }
  }

  /* ═════════ smooth scroll ═════════ */
  let lenis = null;
  function initScroll() {
    if (RM || !FINE || !hasGSAP || typeof window.Lenis === 'undefined') return;
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  function initAnchors() {
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        const target = id === '#top' ? 0 : $(id);
        if (target === null) return;
        e.preventDefault();
        if (lenis) lenis.scrollTo(target, { duration: 1.6 });
        else if (target === 0) scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
        else target.scrollIntoView({ behavior: RM ? 'auto' : 'smooth' });
      });
    });
  }

  /* ═════════ chrome: nav theme, progress ═════════ */
  function initNavTheme() {
    if (!hasGSAP) return;
    $$('main [data-theme]').forEach((sec) => {
      ScrollTrigger.create({
        trigger: sec, start: 'top 40px', end: 'bottom 40px',
        onToggle: (self) => { if (self.isActive) document.body.dataset.nav = sec.dataset.theme; },
      });
    });
    // mark the section you're in, in the top nav and the menu
    const links = $$('.nav a, .mnav a');
    $$('.nav a').forEach((a) => {
      const sec = $(a.getAttribute('href'));
      if (!sec) return;
      ScrollTrigger.create({
        trigger: sec, start: 'top 50%', end: 'bottom 50%',
        onToggle: (self) => {
          if (!self.isActive) return;
          const h = a.getAttribute('href');
          links.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === h));
        },
      });
    });
    const bar = $('.progress span');
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: (s) => {
        bar.style.transform = `scaleX(${s.progress.toFixed(4)})`;
        document.body.classList.toggle('is-scrolled', s.scroll() > innerHeight * 0.6);
      },
    });
  }

  /* ═════════ HERO: the name fills its column, then gathers as you scroll on ═════════ */
  function initHero() {
    const host = $('.hero-name');
    const lines = $$('.kx', host).map((el) => new Kashida(el));
    const st = { open: RM ? 1 : 0, out: 0 };
    let target = 0;
    // both lines justified to the same width, like a calligraphic panel
    const apply = () => lines.forEach((l) => l.setLen(Math.max(0, target - l.natural) * st.open * (1 - st.out)));
    const measure = () => {
      lines.forEach((l) => l.setLen(0));
      host.style.fontSize = '';
      target = host.getBoundingClientRect().width;
      fitWidth(host, lines, target, () => Math.max(...lines.map((l) => l.natural)) * 1.25);
      target = host.getBoundingClientRect().width;
      apply();
    };
    measure();

    if (hasGSAP && !RM) {
      gsap.timeline({ delay: 0.15 })
        .from('.hero-name .line', { yPercent: 50, opacity: 0, duration: 1.1, stagger: 0.12, ease: 'expo.out' })
        .to(st, { open: 1, duration: 1.6, ease: 'expo.inOut', onUpdate: apply }, 0.4)
        .from('.portrait', { y: 30, opacity: 0, duration: 1.3, ease: 'expo.out' }, 0.25)
        .from('.hero .reveal-up', { y: 24, opacity: 0, duration: 0.9, stagger: 0.08, ease: 'expo.out' }, 0.7);
      // tied to scroll in both directions: down gathers the name in, up stretches it back out
      ScrollTrigger.create({
        trigger: '.hero', start: 'top top', end: 'bottom top',
        onUpdate: (s) => { st.out = s.progress * 0.85; apply(); },
      });
    }
    return { measure };
  }

  /* ═════════ BRIDGE: پل — the deck is built from one bank to the other ═════════ */
  function initBridge() {
    const sec = $('.bridge'), svg = $('.bridge-art'), quote = $('.bridge-q');
    const NS = 'http://www.w3.org/2000/svg';
    const arch = $('.br-arch', svg), hangers = $('.br-hangers', svg);
    // hangers drop from the arch to the deck
    const L = arch.getTotalLength();
    const hs = [];
    for (let k = 1; k < 16; k++) {
      const pt = arch.getPointAtLength((L * k) / 16);
      if (pt.y > 146) continue;
      const h = document.createElementNS(NS, 'path');
      h.setAttribute('d', `M${pt.x.toFixed(1)} ${pt.y.toFixed(1)} V150`);
      h.setAttribute('pathLength', '1');
      hangers.append(h);
      hs.push(h);
    }
    const draw = (el, v) => { el.style.strokeDashoffset = (1 - clamp(v, 0, 1)).toFixed(4); };
    const parts = { deck: $('.br-deck', svg), arch, water: $('.br-water', svg) };
    function set(q) {
      draw(parts.water, q / 0.35);
      draw(parts.deck, (q - 0.05) / 0.4);
      draw(parts.arch, (q - 0.2) / 0.45);
      hs.forEach((h, k) => draw(h, (q - 0.45 - k * 0.015) / 0.12));
      const v = clamp((q - 0.35) / 0.35, 0, 1);
      quote.style.opacity = v.toFixed(3);
      quote.style.transform = `translate3d(0,${((1 - v) * 18).toFixed(1)}px,0)`;
    }
    if (!hasGSAP || RM) { set(1); return { calc() {} }; }
    set(0);
    ScrollTrigger.create({
      trigger: sec, start: 'top 85%', end: 'bottom 60%',
      onUpdate: (st) => set(st.progress), onRefresh: (st) => set(st.progress),
    });
    return { calc() {} };
  }

  /* ═════════ word-by-word ink ═════════ */
  function splitWords(el) {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach((w, i) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.textContent = w;
      el.append(s);
      if (i < words.length - 1) el.append(' ');
    });
    return $$('.w', el);
  }
  function initManifesto() {
    $$('[data-words]').forEach((el) => {
      const ws = splitWords(el);
      if (!hasGSAP || RM) return;
      gsap.fromTo(ws, { opacity: 0.12 }, {
        opacity: 1, stagger: 0.1, ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 48%', scrub: true },
      });
    });
  }

  /* ═════════ VOICES: one pen, five registers ═════════ */
  const VOICES = [
    {
      brand: 'هلی‌تاک', field: 'پیجِ رشد فردی', tone: 'خودمانی و گرم', date: 'آذر ۱۴۰۰',
      stat: '۶٬۶۴۰ لایک · ۱۳۲ کامنت', url: 'https://www.instagram.com/p/CXG8l5RNaB1/',
      quote: 'اینکه ما آدمی باشیم که «همیشه» سعی داره بقیه رو خوشحال و راضی کنه، ایده خوبی به‌نظر میاد نه؟ اما در حقیقت این یه الگوی رفتاری غلطه.',
      bg: '#F0532B', fg: '#150B33', w: 700, x: 0.9, y: 0.78,
    },
    {
      brand: 'استودیو نیکدل', field: 'معماری و ساخت', tone: 'شاعرانه و رسمی', date: 'تیر ۱۴۰۱',
      url: 'https://www.instagram.com/p/CgKT3sJI25s/',
      quote: 'نور و روشنایی در همه‌ی فرهنگ‌ها و آیین‌ها از نشانه‌های مقدس حیات است. زیبایی با وجود نور به چشم‌ها می‌رسد.',
      bg: '#24104F', fg: '#C6B6F7', w: 300, x: 0.12, y: 0.88,
    },
    {
      brand: 'APW', field: 'دکوراسیون داخلی', tone: 'کاربردی و راهنما', date: 'خرداد ۱۴۰۳',
      url: 'https://www.instagram.com/p/C8SC2T9NQeL/',
      quote: 'برای ایجاد تعادل در دکوراسیون اتاق نشیمن و به وجود آوردن فضایی دلپذیر، فقط کافی است از این ۳ نکته در چیدمان اتاق نشیمن پیروی کنید.',
      bg: '#FFC21A', fg: '#150B33', w: 500, x: 0.56, y: 0.42,
    },
    {
      brand: 'هُنام', field: 'شتاب‌دهنده‌ی استارتاپ', tone: 'حرفه‌ای و مدیریتی', date: 'تیر ۱۴۰۲',
      url: 'https://www.instagram.com/p/Ct9KPgjoIhH/',
      quote: 'رهبران قابل اعتماد چه ویژگی‌هایی دارند؟ وجود رهبر قابل اعتماد یکی از مهم‌ترین مولفه‌ها در هر کسب‌وکاری است.',
      bg: '#150B33', fg: '#F1ECFA', w: 600, x: 0.3, y: 0.3,
    },
    {
      brand: 'نبکا', field: 'خودروی برقی', tone: 'فنی و دقیق', date: 'اسفند ۱۴۰۲',
      url: 'https://www.instagram.com/p/C35KiljIh2C/',
      quote: 'هزینه شارژ باتری خودرو برقی نبکا ET5 چقدر است؟ با مشخص شدن تعرفه‌های شارژ خودروی برقی، به راحتی می‌توان هزینه شارژ را محاسبه کرد و تصمیمات آگاهانه گرفت.',
      bg: '#17493A', fg: '#F1ECFA', w: 500, x: 0.1, y: 0.1,
    },
  ];

  function initVoices() {
    const sec = $('.voices');
    const tabs = $('.voice-tabs'), quote = $('.voice-quote'), meta = $('.voice-meta'), tone = $('.voice-tone');
    const root = document.documentElement;
    let cur = -1, timer = 0, userTook = false, inView = false, busy = false, pending = -1;

    const btns = VOICES.map((v, i) => {
      const b = document.createElement('button');
      b.className = 'vt'; b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', 'false');
      b.innerHTML = `<span class="vt-k"></span><span class="vt-b"></span><span class="vt-t"></span>`;
      b.querySelector('.vt-b').textContent = v.brand;
      b.querySelector('.vt-t').textContent = v.tone;
      b.addEventListener('click', () => { userTook = true; select(i); });
      tabs.append(b);
      return { b };
    });

    tabs.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const d = e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? 1 : -1;
      const n = (cur + d + VOICES.length) % VOICES.length;
      userTook = true; select(n); btns[n].b.focus();
    });

    function paint(i) {
      const v = VOICES[i];
      root.style.setProperty('--vbg', v.bg);
      root.style.setProperty('--vfg', v.fg);
      tone.textContent = `لحن: ${v.tone}`;
      quote.textContent = v.quote;
      quote.style.fontWeight = v.w;
      meta.innerHTML = '';
      const b = document.createElement('b'); b.textContent = v.brand;
      const f = document.createElement('span'); f.textContent = `${v.field} · ${v.date}`;
      meta.append(b, f);
      if (v.stat) { const s = document.createElement('span'); s.className = 'vm-stat'; s.textContent = v.stat; meta.append(s); }
      const a = document.createElement('a');
      a.href = v.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'دیدنِ پست ↖';
      meta.append(a);
      btns.forEach(({ b: bt }, j) => {
        bt.setAttribute('aria-selected', String(j === i));
        bt.tabIndex = j === i ? 0 : -1;
      });
      return splitWords(quote);
    }

    function select(i) {
      if (busy) { pending = i; return; }
      if (i === cur) return;
      const first = cur === -1;
      cur = i;
      schedule();
      if (!hasGSAP || RM || first) { paint(i); return; }
      busy = true;
      const old = $$('.w', quote);
      gsap.to([...old, tone, meta], {
        opacity: 0, y: -14, duration: 0.32, stagger: 0.008, ease: 'power2.in',
        onComplete: () => {
          const ws = paint(i);
          gsap.fromTo(ws, { opacity: 0, y: 22 }, {
            opacity: 1, y: 0, duration: 0.7, stagger: 0.022, ease: 'expo.out',
            onComplete: () => { busy = false; if (pending >= 0) { const p = pending; pending = -1; select(p); } },
          });
          gsap.fromTo([tone, meta], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out', delay: 0.15 });
        },
      });
    }
    function schedule() {
      clearTimeout(timer);
      if (userTook || RM || !inView || isMobile()) return;
      timer = setTimeout(() => select((cur + 1) % VOICES.length), 7000);
    }

    select(0);
    if (hasGSAP) {
      ScrollTrigger.create({
        trigger: sec, start: 'top 60%', end: 'bottom 40%',
        onToggle: (s) => { inView = s.isActive; schedule(); },
      });
    }
  }

  /* ═════════ WRITING: dot leaders give way to kashida ═════════ */
  function initToc() {
    const rows = $$('.toc-row');
    // titles wider than their line wrap instead of overflowing
    const check = () => rows.forEach((row) => {
      row.classList.remove('is-wrapped');
      const title = $('.toc-title', row), line = $('.toc-line', row);
      row.classList.toggle('is-wrapped', isMobile() || title.scrollWidth > line.clientWidth - 80);
    });
    check();
    onResize(check);
  }

  /* ═════════ TALASEA 1: the highway drive ═════════ */
  function initDrive(scroller) {
    const sec = $('.drive'), stage = $('.drive-stage'), cv = $('.drive-canvas');
    const ctx = cv.getContext('2d');
    const boards = $$('.board'), subs = $$('.sub');
    const BZ = [78, 158, 238], LEN = 262, BASE = 50; // metres; px per metre on the board element
    const CAM_H = 1.4, LANE = 3.6, HALF = 7.2;
    let W = 0, H = 0, dpr = 1, hz = 0, f = 0, progress = 0;

    // Alborz ridge, seeded so it never jumps
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ridge = Array.from({ length: 90 }, () => rnd());
    const ridgeS = ridge.map((_, i) => {
      let s = 0, n = 0;
      for (let k = -3; k <= 3; k++) { const v = ridge[(i + k + 90) % 90]; s += v * (4 - Math.abs(k)); n += 4 - Math.abs(k); }
      return s / n;
    });
    const lights = Array.from({ length: 140 }, () => [rnd(), rnd(), rnd()]);

    function resize() {
      const r = stage.getBoundingClientRect();
      W = r.width; H = r.height;
      dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      hz = H * (W < H ? 0.5 : 0.45);
      f = W < H ? W * 1.15 : H * 1.05;
      render();
    }

    const proj = (x, y, z) => [W / 2 + (f * x) / z, hz + (f * (CAM_H - y)) / z];

    function quad(x0, x1, z0, z1, color) {
      const zn = 0.6;
      z0 = Math.max(z0, zn); z1 = Math.max(z1, zn);
      if (z1 <= z0) return;
      const a = proj(x0, 0, z0), b = proj(x1, 0, z0), c = proj(x1, 0, z1), d = proj(x0, 0, z1);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
    }

    function render() {
      if (!W) return;
      const D = progress * LEN;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // sky: Tehran dusk, smog lit from below
      const sky = ctx.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, '#0E0626'); sky.addColorStop(0.45, '#2A1466');
      sky.addColorStop(0.78, '#8A2F6B'); sky.addColorStop(0.93, '#F0532B'); sky.addColorStop(1, '#FFB21A');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz + 1);
      const glow = ctx.createRadialGradient(W * 0.5, hz, 0, W * 0.5, hz, W * 0.55);
      glow.addColorStop(0, 'rgba(255,194,26,.55)'); glow.addColorStop(1, 'rgba(255,194,26,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, hz + 1);

      // Alborz
      const shift = D * 0.15;
      ctx.fillStyle = '#3A1A6E';
      const RN = Math.round(clamp(W / 16, 24, 90));
      const rh = Math.min(H, W * 0.9);
      ctx.beginPath(); ctx.moveTo(0, hz);
      for (let i = 0; i <= RN; i++) {
        const xx = (i / RN) * W;
        const v = ridgeS[(i + Math.floor(shift / 20)) % 90];
        ctx.lineTo(xx, hz - rh * (0.05 + 0.11 * v));
      }
      ctx.lineTo(W, hz); ctx.closePath(); ctx.fill();
      // snow line on the highest peaks
      ctx.strokeStyle = 'rgba(198,182,247,.35)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= RN; i++) {
        const v = ridgeS[(i + Math.floor(shift / 20)) % 90];
        const xx = (i / RN) * W, yy = hz - rh * (0.05 + 0.11 * v);
        if (v > 0.56) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
      }
      ctx.stroke();

      // city band + Milad tower
      ctx.fillStyle = '#1A0B3D';
      ctx.fillRect(0, hz - H * 0.025, W, H * 0.025 + 1);
      const mx = W * 0.71, mh = Math.min(H * 0.2, W * 0.3), base = hz - H * 0.02;
      ctx.fillStyle = '#1A0B3D';
      ctx.beginPath();
      ctx.moveTo(mx - mh * 0.08, base); ctx.lineTo(mx - mh * 0.018, base - mh * 0.62); ctx.lineTo(mx + mh * 0.018, base - mh * 0.62); ctx.lineTo(mx + mh * 0.08, base); ctx.fill();
      ctx.beginPath(); ctx.ellipse(mx, base - mh * 0.68, mh * 0.11, mh * 0.065, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(mx - 2.5, base - mh * 0.95, 5, mh * 0.3);
      ctx.fillRect(mx - 1, base - mh * 1.12, 2, mh * 0.2);
      ctx.fillStyle = '#F0532B';
      ctx.beginPath(); ctx.arc(mx, base - mh * 1.12, 2.2, 0, Math.PI * 2); ctx.fill();
      // city lights
      lights.forEach(([a, b, c], i) => {
        const lx = a * W, ly = hz - H * 0.022 + b * H * 0.02;
        const on = 0.4 + 0.6 * Math.abs(Math.sin(i * 12.9 + D * 0.02));
        ctx.fillStyle = c > 0.7 ? `rgba(255,194,26,${0.7 * on})` : `rgba(198,182,247,${0.45 * on})`;
        ctx.fillRect(lx, ly, 2, 2);
      });

      // ground
      const gnd = ctx.createLinearGradient(0, hz, 0, H);
      gnd.addColorStop(0, '#1C0D45'); gnd.addColorStop(1, '#0B0420');
      ctx.fillStyle = gnd; ctx.fillRect(0, hz, W, H - hz);

      // road
      const FAR = 900;
      quad(-HALF - 0.6, HALF + 0.6, 0.6, FAR, '#241650');
      quad(-HALF, -HALF + 0.18, 0.6, FAR, 'rgba(241,236,250,.75)');
      quad(HALF - 0.18, HALF, 0.6, FAR, 'rgba(241,236,250,.75)');
      for (const lx of [-LANE * 1.5, -LANE * 0.5, LANE * 0.5, LANE * 1.5]) {
        const start = Math.floor(D / 12) * 12;
        for (let z = start; z < D + 320; z += 12) {
          const z0 = z - D, z1 = z0 + 4.5;
          if (z1 < 0.6) continue;
          quad(lx - 0.08, lx + 0.08, z0, z1, 'rgba(255,194,26,.85)');
        }
      }
      // median barrier + lamp posts on the left
      quad(-HALF - 1.4, -HALF - 0.9, 0.6, FAR, '#3B1E86');
      const lp = 36, ls = Math.floor(D / lp) * lp;
      for (let z = ls + lp * 12; z >= ls; z -= lp) {
        const zz = z - D;
        if (zz < 1.2) continue;
        const [bx, by] = proj(-HALF - 1.15, 0, zz);
        const [, ty] = proj(-HALF - 1.15, 10, zz);
        const [ax] = proj(-HALF + 1.2, 10, zz);
        const lw = Math.max(1, 0.18 * f / zz);
        ctx.strokeStyle = '#2E1A63'; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, ty); ctx.lineTo(ax, ty); ctx.stroke();
        const gr = Math.max(1.2, 0.32 * f / zz);
        const g2 = ctx.createRadialGradient(ax, ty, 0, ax, ty, gr * 4);
        g2.addColorStop(0, 'rgba(255,214,120,.55)'); g2.addColorStop(1, 'rgba(255,194,26,0)');
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(ax, ty, gr * 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFE7A6'; ctx.beginPath(); ctx.arc(ax, ty + lw * 0.6, gr * 0.7, 0, Math.PI * 2); ctx.fill();
      }

      // vignette
      const vg = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.3, W / 2, H * 0.55, Math.max(W, H) * 0.8);
      vg.addColorStop(0, 'rgba(8,3,24,0)'); vg.addColorStop(1, 'rgba(8,3,24,.65)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

      // billboards (DOM, so the type stays crisp)
      boards.forEach((b, i) => {
        const z = BZ[i] - D;
        if (z < 2.2 || z > 330) { b.style.opacity = '0'; return; }
        const side = +b.dataset.side;
        const s = f / z;
        const tall = W < H;
        // portrait: overhead gantry boards above the lanes; landscape: roadside boards
        const cx = tall ? side * 2.2 : side * (HALF + (side > 0 ? 3.2 : 4.6) + 6);
        const left = W / 2 + (cx - 6) * s;
        const top = hz + (CAM_H - (tall ? 7 + 5.4 : 5 + 5.4)) * s;
        b.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0) scale(${(s / BASE).toFixed(4)})`;
        b.style.opacity = String(clamp((330 - z) / 70, 0, 1));
        b.style.zIndex = String(1000 - Math.round(z));
      });

      // subtitles
      const marks = [0, 0.3, 0.6];
      let idx = 0;
      marks.forEach((m, i) => { if (progress >= m) idx = i; });
      subs.forEach((s, i) => s.classList.toggle('is-on', i === idx));
    }

    resize();
    onResize(resize);
    const kills = [() => offResize(resize)];
    if (!hasGSAP || RM) { progress = 0.33; render(); return kills; }
    const trig = ScrollTrigger.create({
      trigger: sec, scroller, start: 'top top', end: 'bottom bottom',
      onUpdate: (s) => { progress = s.progress; render(); },
    });
    kills.push(() => trig.kill());
    return kills;
  }

  /* ═════════ TALASEA 2: «اما...» stretches as you hesitate ═════════ */
  function initBut(scroller) {
    const el = $('.cq-but .kx');
    if (!el) return [];
    if (!el._k) el._k = new Kashida(el);
    const k = el._k, host = el.parentElement;
    const st = { p: RM ? 1 : 0 };
    let max = 0;
    const apply = () => k.setLen(max * st.p);
    const calc = () => {
      k.setLen(0);
      k.measure();
      max = Math.max(0, host.getBoundingClientRect().width * 0.96 - k.natural);
      apply();
    };
    calc();
    onResize(calc);
    const kills = [() => offResize(calc)];
    if (!hasGSAP || RM) return kills;
    const tw = gsap.to(st, {
      p: 1, ease: 'none', onUpdate: apply,
      scrollTrigger: { trigger: el, scroller, start: 'top 90%', end: 'top 35%', scrub: true },
    });
    kills.push(() => { tw.scrollTrigger && tw.scrollTrigger.kill(); tw.kill(); });
    return kills;
  }

  /* ═════════ TALASEA 3: a calm sea, lit gold ═════════ */
  function initSea(scroller) {
    const wrap = $('.sea-bg'), cv = $('canvas', wrap), ctx = cv.getContext('2d');
    let W = 0, H = 0, dpr = 1, on = false, last = 0;
    const R = 120;
    const rowSeed = Array.from({ length: R }, (_, i) => [Math.sin(i * 91.7) * 43758.5 % 1, Math.cos(i * 13.3) * 9157.1 % 1]);

    function resize() {
      const r = wrap.getBoundingClientRect();
      W = r.width; H = r.height;
      dpr = Math.min(isMobile() ? 1.5 : 2, devicePixelRatio || 1);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      draw(performance.now());
    }

    function draw(now) {
      if (!W) return;
      const t = now / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const hz = H * (W < H ? 0.68 : 0.64), cx = W * 0.5;
      const sky = ctx.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, '#0E0626'); sky.addColorStop(0.62, '#24104F'); sky.addColorStop(0.86, '#6E2A72'); sky.addColorStop(0.97, '#E2683A'); sky.addColorStop(1, '#FFB443');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz + 1);
      // sun, sitting low
      const sr = Math.min(W, H) * 0.075, sy = hz - sr * 0.55;
      const halo = ctx.createRadialGradient(cx, sy, sr * 0.6, cx, sy, sr * 3.2);
      halo.addColorStop(0, 'rgba(255,200,60,.45)'); halo.addColorStop(1, 'rgba(255,200,60,0)');
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, hz);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hz); ctx.clip();
      ctx.fillStyle = '#FFD25E'; ctx.beginPath(); ctx.arc(cx, sy, sr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // water
      const sea = ctx.createLinearGradient(0, hz, 0, H);
      sea.addColorStop(0, '#2B1466'); sea.addColorStop(0.5, '#1A0B45'); sea.addColorStop(1, '#0E0628');
      ctx.fillStyle = sea; ctx.fillRect(0, hz, W, H - hz);
      // glints: the sun's road on the water, built from short strokes
      ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < R; r++) {
        const v = r / R;
        const y = hz + Math.pow(v, 1.75) * (H - hz) + 1;
        const th = 0.8 + v * 2.6;
        const step = 5 + v * 26;
        const half = W * (0.035 + v * 0.3);
        const [p1, p2] = rowSeed[r];
        // faint swell lines across the whole sea
        if (r % 3 === 0) {
          ctx.fillStyle = `rgba(198,182,247,${0.035 + v * 0.04})`;
          ctx.fillRect(0, y, W, th * 0.6);
        }
        for (let x = cx - half * 2.4; x < cx + half * 2.4; x += step) {
          const g = Math.exp(-(((x - cx) / half) ** 2));
          const n = Math.sin(x * (0.045 / (0.35 + v)) + t * (1.2 + p1) + p2 * 9) * Math.sin(x * 0.011 - t * 0.6 + p1 * 5);
          if (n <= 0) continue;
          const a = g * n * n * n * 2.2;
          if (a < 0.03) continue;
          const len = step * (0.45 + 0.7 * n);
          ctx.fillStyle = a > 0.6 ? `rgba(255,236,170,${Math.min(1, a)})` : `rgba(255,194,26,${Math.min(1, a)})`;
          ctx.fillRect(x - len / 2, y, len, th);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    function loop(now) {
      if (!on) return;
      if (now - last > 33) { draw(now); last = now; }
      requestAnimationFrame(loop);
    }

    resize();
    onResize(resize);
    const kills = [() => offResize(resize), () => { on = false; }];
    if (RM) return kills;
    const io = new IntersectionObserver(([e]) => {
      on = e.isIntersecting;
      if (on) requestAnimationFrame(loop);
    });
    io.observe(wrap);
    kills.push(() => io.disconnect());

    if (!hasGSAP) return kills;
    // the restraint beat: each obvious image gets struck out
    $$('.rejects s').forEach((s, i) => {
      const tw = gsap.fromTo(s, { '--p': 0 }, {
        '--p': 1, ease: 'power2.inOut',
        scrollTrigger: { trigger: '.rejects ul', scroller, start: `top ${78 - i * 9}%`, end: `top ${58 - i * 9}%`, scrub: 0.5 },
      });
      kills.push(() => { tw.scrollTrigger && tw.scrollTrigger.kill(); tw.kill(); });
    });
    return kills;
  }

  /* ═════════ CASES: each teardown opens full screen, in place ═════════ */
  function initCases() {
    let open = null;
    const html = document.documentElement;

    // a plain solid panel carries the motion; the heavy case layer only ever fades
    const curtain = document.createElement('div');
    curtain.className = 'case-curtain';
    curtain.setAttribute('aria-hidden', 'true');
    document.body.append(curtain);
    let busy = false, closeQueued = false;

    const cardBox = (card) => {
      if (!card) return null;
      const r = card.getBoundingClientRect();
      const onScreen = r.bottom > 0 && r.top < innerHeight && r.width > 0;
      return onScreen ? { x: r.left, y: r.top, sx: r.width / innerWidth, sy: r.height / innerHeight } : null;
    };

    // below-the-fold content rises in as you read; the opening screen is part of the entrance instead
    function revealsIn(ov, scroller) {
      if (!hasGSAP || RM) return [];
      const els = $$('.cq-h, .cq-grid article, .cq-punch, .sea-name, .sea-grid article, .rejects-t, .rejects-why, .sea-close, .case-end > *', ov);
      gsap.set(els, { y: 36, opacity: 0 });
      const trigs = ScrollTrigger.batch(els, {
        scroller, start: 'top 90%', once: true,
        onEnter: revealBatch,
      });
      return [() => { trigs.forEach((tr) => tr.kill()); gsap.set(els, { clearProps: 'transform,opacity' }); }];
    }

    function openCase(id, card, pushed) {
      const ov = $('#case-' + id);
      if (!ov || open || busy) return;
      const sc = $('.case-scroll', ov), inner = $('.case-inner', ov);
      open = { id, ov, card, pushed, kills: [], lenis: null, tick: null };
      busy = true;
      if (lenis) lenis.stop();
      html.classList.add('case-open');

      // 1. build everything while the layer is present but invisible, so nothing pops in later
      ov.hidden = false;
      if (hasGSAP) gsap.set(ov, { autoAlpha: 0 }); else ov.style.opacity = '0';
      sc.scrollTop = 0;
      if (hasGSAP && !RM && FINE && typeof window.Lenis !== 'undefined') {
        const l = new Lenis({ wrapper: sc, content: inner, lerp: 0.09 });
        const tick = (tt) => l.raf(tt * 1000);
        gsap.ticker.add(tick);
        l.on('scroll', ScrollTrigger.update);
        open.lenis = l; open.tick = tick;
      }
      open.kills.push(...initDrive(sc), ...initBut(sc), ...initSea(sc), ...revealsIn(ov, sc));

      const done = () => {
        busy = false;
        if (closeQueued) { closeQueued = false; closeCase(); return; }
        $('.case-close', ov).focus({ preventScroll: true });
      };
      if (!hasGSAP || RM) { ov.style.opacity = ''; if (hasGSAP) gsap.set(ov, { autoAlpha: 1 }); done(); return; }

      // 2. the curtain grows out of the card (transform only), 3. the case fades in on top of it
      const box = cardBox(card);
      const intro = $$('.case-bar, .tl-intro-grid > *', ov);
      const tl = gsap.timeline({ onComplete: done });
      if (box) {
        tl.set(curtain, { visibility: 'visible', x: box.x, y: box.y, scaleX: box.sx, scaleY: box.sy })
          .to(curtain, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 0.75, ease: 'expo.inOut' });
      } else {
        tl.set(curtain, { visibility: 'visible', x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 0 })
          .to(curtain, { opacity: 1, duration: 0.3, ease: 'power1.out' });
      }
      tl.set(intro, { y: 28, opacity: 0 })
        .to(ov, { autoAlpha: 1, duration: 0.3, ease: 'power1.out' })
        .to(intro, { y: 0, opacity: 1, duration: 0.9, stagger: 0.07, ease: 'expo.out' }, '<0.05')
        .set(curtain, { visibility: 'hidden', opacity: 1 });
    }

    function closeCase() {
      if (!open) return;
      if (busy) { closeQueued = true; return; }
      const { ov, card, kills, lenis: l, tick } = open;
      open = null;
      busy = true;
      const finish = () => {
        html.classList.remove('case-open');
        if (lenis) lenis.start();
        busy = false;
        if (card) card.focus({ preventScroll: true });
      };
      const teardown = () => {
        ov.hidden = true;
        kills.forEach((k) => k && k());
        if (l) { l.destroy(); gsap.ticker.remove(tick); }
        if (hasGSAP) gsap.set(ov, { clearProps: 'opacity,visibility' });
      };
      if (!hasGSAP || RM) { teardown(); finish(); return; }

      // reverse: curtain slides under, case fades off it, curtain folds back into the card
      const box = cardBox(card);
      const tl = gsap.timeline({ onComplete: finish });
      tl.set(curtain, { visibility: 'visible', x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 })
        .to(ov, { autoAlpha: 0, duration: 0.25, ease: 'power1.in' })
        .add(teardown);
      if (box) tl.to(curtain, { x: box.x, y: box.y, scaleX: box.sx, scaleY: box.sy, duration: 0.65, ease: 'expo.inOut' });
      else tl.to(curtain, { opacity: 0, duration: 0.3 });
      tl.set(curtain, { visibility: 'hidden', opacity: 1 });
    }

    // the address bar follows the dialog, so Back closes it and a shared link opens it
    function requestClose() {
      if (!open) return;
      if (open.pushed) history.back();
      else { history.replaceState(null, '', location.pathname + location.search); closeCase(); }
    }

    $$('.case-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.dataset.case;
        history.pushState({ case: id }, '', '#' + id);
        openCase(id, card, true);
      });
    });
    $$('.case [data-close]').forEach((b) => b.addEventListener('click', requestClose));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) requestClose(); });
    addEventListener('popstate', () => {
      const id = location.hash.slice(1);
      if (open && open.id !== id) closeCase();
      else if (!open && $('#case-' + id)) openCase(id, $(`.case-card[data-case="${id}"]`), true);
    });
    // keep focus inside the open dialog
    document.addEventListener('focusin', (e) => {
      if (open && !open.ov.contains(e.target)) $('.case-close', open.ov).focus({ preventScroll: true });
    });

    const id = location.hash.slice(1);
    if ($('#case-' + id)) openCase(id, $(`.case-card[data-case="${id}"]`), false);
  }

  /* ═════════ phone/tablet menu ═════════ */
  function initMenu() {
    const btn = $('.menu-btn');
    const set = (on) => {
      document.body.classList.toggle('menu-open', on);
      btn.setAttribute('aria-expanded', String(on));
      btn.textContent = on ? 'بستن' : 'منو';
      if (lenis) on ? lenis.stop() : lenis.start();
    };
    btn.addEventListener('click', () => set(!document.body.classList.contains('menu-open')));
    $$('.mnav a').forEach((a) => a.addEventListener('click', () => set(false)));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) set(false); });
  }

  /* ═════════ PATH: horizontal, right to left ═════════ */
  /* ═════════ marquee that answers scroll speed ═════════ */
  function initMarquee() {
    $$('.mq').forEach((mq) => {
      const inner = $('.mq-in', mq);
      inner.innerHTML += inner.innerHTML;
      if (RM) return;
      const dir = +mq.dataset.dir;
      let x = 0, w = inner.scrollWidth / 2, on = false;
      onResize(() => { w = inner.scrollWidth / 2; });
      new IntersectionObserver(([e]) => { on = e.isIntersecting; }).observe(mq);
      const tick = () => {
        if (on) {
          const v = lenis ? Math.min(40, Math.abs(lenis.velocity)) : 0;
          x = (((x + dir * (0.7 + v * 0.35)) % w) + w) % w;
          inner.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ═════════ CONTACT: «تمـــاس», stretched by your scroll, fitted to the screen ═════════ */
  function initContact() {
    const host = $('.ct-hello');
    const k = new Kashida($('.kx', host));
    const st = { p: RM ? 1 : 0 };
    let L = 0;
    const apply = () => k.setLen(L * st.p);
    const calc = () => {
      k.setLen(0);
      host.style.fontSize = '';
      k.measure();
      L = 1.1 * k.fs;
      const pad = parseFloat(getComputedStyle(host).paddingLeft) * 2;
      fitWidth(host, [k], host.clientWidth - pad, () => k.natural + L);
      L = 1.1 * k.fs;
      apply();
    };
    calc();
    onResize(calc);
    if (hasGSAP && !RM) {
      gsap.to(st, { p: 1, ease: 'none', onUpdate: apply, scrollTrigger: { trigger: host, start: 'top 95%', end: 'top 35%', scrub: true } });
    }

    const btn = $('.ct-mail');
    btn.addEventListener('click', async () => {
      const v = btn.dataset.copy;
      try { await navigator.clipboard.writeText(v); }
      catch (e) {
        const ta = document.createElement('textarea'); ta.value = v; document.body.append(ta); ta.select();
        try { document.execCommand('copy'); } catch (_) { /* nothing else to try */ }
        ta.remove();
      }
      btn.classList.add('is-copied');
      setTimeout(() => btn.classList.remove('is-copied'), 1800);
    });
  }

  // A jump (nav link, fast fling) can enter dozens of items at once. Items already
  // scrolled past appear instantly; only what's on screen fades, with a capped stagger.
  function revealBatch(batch) {
    const vh = innerHeight;
    const onScreen = batch.filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < vh; });
    const passed = batch.filter((e) => !onScreen.includes(e));
    if (passed.length) gsap.set(passed, { y: 0, opacity: 1, overwrite: true });
    if (onScreen.length) {
      gsap.to(onScreen, { y: 0, opacity: 1, duration: 1, ease: 'expo.out', overwrite: true, stagger: Math.min(0.07, 0.42 / onScreen.length) });
    }
  }

  /* ═════════ quiet reveals ═════════ */
  function initReveals() {
    if (!hasGSAP || RM) return;
    const sel = [
      '.about-t', '.about-lede', '.facts', '.pr-item', '.path-head > *', '.job', '.voices-head > *', '.writing-head > *',
      '.toc li', '.cases-head > *', '.case-card', '.tk-head > *', '.tk-col', '.tools li', '.ws-head > *', '.notebook li',
      '.ct-lead', '.ct-actions > *', '.ig > *',
    ].join(',');
    const els = $$(sel).filter((e) => !e.closest('.case'));
    gsap.set(els, { y: 36, opacity: 0 });
    ScrollTrigger.batch(els, {
      start: 'top 90%', once: true,
      onEnter: revealBatch,
    });
  }

  /* ═════════ boot ═════════ */
  function boot() {
    document.body.classList.remove('is-loading');
    initScroll();
    initAnchors();
    const hero = initHero();
    const bridge = initBridge();
    initManifesto();
    initVoices();
    initToc();
    initMarquee();
    initContact();
    initCases();
    initMenu();
    initReveals();
    initNavTheme();

    let rt = 0;
    onResize(() => {
      clearTimeout(rt);
      rt = setTimeout(() => { hero.measure(); if (hasGSAP) ScrollTrigger.refresh(); }, 200);
    });
    if (hasGSAP) ScrollTrigger.refresh();
  }

  const fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([
    Promise.all([fontsReady, document.fonts ? document.fonts.load('400 100px Lalezar', 'ریحانه') : null]),
    new Promise((r) => setTimeout(r, 2500)),
  ]).then(boot);
})();
