/* Sweet Home, trang giới thiệu: đổi tiếng, email hợp tác, hiện dần khi cuộn, câu chuyện một tuần. */
(function () {
  'use strict';
  window.SH_READY = true;

  // Email hợp tác: chỉ sửa ở đây. Chữ hiện trên trang và link mailto đều lấy từ dòng này.
  var EMAIL = 'kayayquach@gmail.com';

  var TEXT = {
    vi: {
      title: 'Sweet Home · Ở xa mà gần',
      desc: 'App cho cả nhà đang sống xa nhau. Ảnh mỗi ngày, thư tay, gọi video, lịch âm và Mây gọi hỏi chuyện từng người mỗi tuần. Đang beta, miễn phí.',
      subject: 'Hợp tác ưu đãi với Sweet Home'
    },
    ko: {
      title: 'Sweet Home · 멀리 있어도 가까운 가족',
      desc: '떨어져 사는 가족을 위한 앱. 매일의 사진, 손편지, 영상통화, 음력 달력, 그리고 매주 식구마다 전화해 이야기를 듣는 AI 친구 Mây. 지금은 베타라 무료예요.',
      subject: 'Sweet Home 제휴 문의'
    },
    en: {
      title: 'Sweet Home · Far apart, still close',
      desc: 'An app for families who live apart. Daily photos, letters, video calls, a lunar calendar, and Mây, an AI friend who calls each of you once a week. In beta and free for now.',
      subject: 'Partnership with Sweet Home'
    }
  };

  var root = document.documentElement;
  var all = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  function apply(lang) {
    if (!TEXT[lang]) lang = 'vi';
    root.setAttribute('data-lang', lang);
    root.lang = lang;
    document.title = TEXT[lang].title;
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', TEXT[lang].desc);
    all('img[data-alt-ko]').forEach(function (img) {
      if (!img.hasAttribute('data-alt-vi')) img.setAttribute('data-alt-vi', img.alt);
      img.alt = img.getAttribute('data-alt-' + lang) || img.getAttribute('data-alt-vi');
    });
    all('[data-set-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang)); });
    all('[data-lang-select]').forEach(function (s) { s.value = lang; });
    all('[data-mailto]').forEach(function (a) { a.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(TEXT[lang].subject); });
  }

  function choose(lang) {
    apply(lang);
    try { localStorage.setItem('sh-lang', lang); } catch (e) {}
    // Link đang có ?lang= thì đổi theo, để tải lại hay gửi link vẫn đúng tiếng.
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('lang')) { u.searchParams.set('lang', lang); history.replaceState(null, '', u.toString()); }
    } catch (e) {}
  }

  all('[data-email]').forEach(function (a) { a.textContent = EMAIL; a.href = 'mailto:' + EMAIL; });
  apply(root.getAttribute('data-lang') || 'vi');
  all('[data-set-lang]').forEach(function (b) { b.addEventListener('click', function () { choose(b.getAttribute('data-set-lang')); }); });
  all('[data-lang-select]').forEach(function (s) { s.addEventListener('change', function () { choose(s.value); }); });

  // Viền dưới thanh trên khi đã cuộn
  var top = document.getElementById('top');
  var onScroll = function () { top.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (!('IntersectionObserver' in window)) {
    all('.rv').forEach(function (el) { el.classList.add('in'); });
    return;
  }

  // Hiện dần khi cuộn tới
  var seen = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); seen.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  all('.rv').forEach(function (el) { seen.observe(el); });

  // Một tuần: bước nào ở giữa màn hình thì điện thoại bên phải hiện màn của bước đó (máy tính)
  var steps = all('.step');
  var screens = all('.stage-phone .screen img');
  var stepper = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var i = steps.indexOf(e.target);
      steps.forEach(function (s, k) { s.classList.toggle('active', k === i); });
      screens.forEach(function (img, k) { img.classList.toggle('on', k === i); });
    });
  }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach(function (s) { stepper.observe(s); });
})();
