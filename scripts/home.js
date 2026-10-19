'use strict';

/**
 * 首页生成器
 * 结构：主视觉 → 精选作品 → 产出流水（自动聚合）→ 最近文章
 * 作品数据：source/_data/projects.json
 * 流水数据：source/_data/timeline.json（由 scripts/gen-timeline.js 生成）
 */

const fs = require('fs');
const path = require('path');

hexo.extend.generator.register('home', function (locals) {
  const root = this.config.root || '/';
  const baseDir = hexo.base_dir;

  const readJson = function (rel, fallback) {
    try {
      return JSON.parse(fs.readFileSync(path.join(baseDir, rel), 'utf8'));
    } catch (e) {
      return fallback;
    }
  };

  const projects = readJson('source/_data/projects.json', { featured: [], projects: [] });
  const timeline = readJson('source/_data/timeline.json', { items: [] });

  const esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  const fmtMD = function (d) {
    if (!d) return '';
    const s = String(d);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[2] + '.' + m[3];
    m = s.match(/^(\d{4})-(\d{2})$/);
    if (m) return m[2] + '月';
    return s;
  };

  const kindIcon = { ship: '↗', build: '◈', doc: '✎', study: '◎' };
  const kindLabel = { ship: '交付', build: '构建', doc: '写作', study: '研究' };
  const projectAccent = {
    '普融智盾': 'green',
    '羽社通': 'amber',
    '五次方的夏天': 'blue'
  };

  let html = '';

  /* ============ 主视觉 ============ */
  const totalWorks = (projects.projects || []).length;
  const totalLogs = (timeline.items || []).length;

  html += '<div class="home-v2">\n';
  html += '<section class="hero">\n';
  html += '  <div class="hero-copy">\n';
  html += '    <span class="hero-tag"><i class="dot-live"></i>正在做</span>\n';
  html += '    <h1 class="hero-title">做过的事，<br><span class="hl">都留在这里</span></h1>\n';
  html += '    <p class="hero-sub">' + totalWorks + ' 段项目、' + totalLogs + ' 条产出记录。不是日记，是证据——做了什么、为什么这么做、最后成没成。</p>\n';
  html += '    <div class="hero-actions">\n';
  html += '      <a class="btn-solid" href="#works">看作品 <span>↓</span></a>\n';
  html += '      <a class="btn-line" href="' + root + 'log/">全部流水</a>\n';
  html += '    </div>\n';
  html += '  </div>\n';
  html += '  <div class="hero-art">\n';
  html += '    <div class="hero-blob"></div>\n';
  html += '    <img class="hero-mascot" src="' + root + 'images/mascot-girl.png" alt="" loading="eager">\n';

  // 浮动标签取第一个作品的真实指标，避免写死不同步
  const lead = (projects.projects || [])[0] || {};
  const leadMetrics = (lead.metrics || []).slice(0, 2);
  if (lead.status) {
    html += '    <span class="float-chip fc2">' + esc(lead.status) + '</span>\n';
  }
  if (leadMetrics[0]) {
    html += '    <span class="float-chip fc1">' + esc(leadMetrics[0].value) + ' ' + esc(leadMetrics[0].label) + '</span>\n';
  }
  if (leadMetrics[1]) {
    html += '    <span class="float-chip fc3">' + esc(leadMetrics[1].value) + ' ' + esc(leadMetrics[1].label) + '</span>\n';
  }
  html += '  </div>\n';
  html += '</section>\n';

  /* ============ 精选作品 ============ */
  const bySlug = {};
  (projects.projects || []).forEach(function (p) { bySlug[p.slug] = p; });
  const featured = (projects.featured || []).map(function (s) { return bySlug[s]; }).filter(Boolean);

  html += '<section class="sec" id="works">\n';
  html += '  <div class="sec-hd">\n';
  html += '    <h2>作品<span class="sec-count">' + totalWorks + '</span></h2>\n';
  html += '    <p>在跑的东西，不是课程作业</p>\n';
  html += '  </div>\n';
  html += '  <div class="work-grid">\n';

  featured.forEach(function (p, i) {
    const cls = i === 0 ? 'work-card work-lg' : 'work-card';
    const acc = p.accent || 'green';
    html += '    <article class="' + cls + ' acc-' + acc + ' reveal">\n';
    html += '      <div class="work-head">\n';
    html += '        <span class="work-status' + (p.statusType === 'live' ? ' is-live' : '') + '">' + esc(p.status) + '</span>\n';
    html += '        <span class="work-period">' + esc(p.period) + '</span>\n';
    html += '      </div>\n';
    html += '      <div class="work-body">\n';
    html += '        <h3 class="work-name">' + esc(p.name) + '</h3>\n';
    html += '        <p class="work-sub">' + esc(p.subtitle) + '</p>\n';
    html += '        <p class="work-desc">' + esc(p.summary) + '</p>\n';
    html += '        <div class="work-metrics">\n';
    (p.metrics || []).forEach(function (m) {
      html += '          <div class="wm"><b>' + esc(m.value) + '</b><span>' + esc(m.label) + '</span></div>\n';
    });
    html += '        </div>\n';
    if (p.highlights && p.highlights.length) {
      html += '        <ul class="work-points">\n';
      p.highlights.slice(0, i === 0 ? 3 : 2).forEach(function (h) {
        html += '          <li>' + esc(h) + '</li>\n';
      });
      html += '        </ul>\n';
    }
    html += '        <div class="work-foot">\n';
    html += '          <span class="work-role">' + esc(p.role) + '</span>\n';
    html += '          <div class="work-stack">\n';
    (p.stack || []).forEach(function (s) {
      html += '            <span>' + esc(s) + '</span>\n';
    });
    html += '          </div>\n';
    html += '        </div>\n';
    if (p.awards && p.awards.length) {
      html += '        <div class="work-awards">\n';
      p.awards.forEach(function (a) {
        html += '          <span class="award">' + esc(a) + '</span>\n';
      });
      html += '        </div>\n';
    }
    html += '      </div>\n';
    html += '    </article>\n';
  });

  html += '  </div>\n';
  html += '</section>\n';

  /* ============ 产出流水 ============ */
  const items = (timeline.items || []).slice(0, 8);

  html += '<section class="sec sec-log">\n';
  html += '  <div class="sec-hd">\n';
  html += '    <h2>产出流水<span class="sec-count">' + totalLogs + '</span></h2>\n';
  html += '    <p>自动聚合自代码提交和工作记录，不用手写</p>\n';
  html += '  </div>\n';

  if (items.length === 0) {
    html += '  <p class="empty">还没有记录。跑一次 <code>node scripts/gen-timeline.js</code> 就能生成。</p>\n';
  } else {
    html += '  <div class="log-line">\n';
    let lastMonth = '';
    items.forEach(function (it) {
      const month = String(it.date).slice(0, 7);
      if (month !== lastMonth) {
        lastMonth = month;
        html += '    <div class="log-month"><span>' + month.slice(5) + ' 月</span></div>\n';
      }
      const acc = projectAccent[it.project] || 'slate';
      html += '    <div class="log-item reveal">\n';
      html += '      <div class="log-date">\n';
      html += '        <b>' + fmtMD(it.date) + '</b>\n';
      html += '        <span>' + (it.time ? esc(it.time) : '—') + '</span>\n';
      html += '      </div>\n';
      html += '      <div class="log-dot acc-' + acc + '"></div>\n';
      html += '      <div class="log-body">\n';
      html += '        <div class="log-title">' + esc(it.title) + '</div>\n';
      html += '        <div class="log-meta">\n';
      html += '          <span class="log-proj acc-' + acc + '">' + esc(it.project) + '</span>\n';
      html += '          <span class="log-kind">' + (kindIcon[it.kind] || '◈') + ' ' + (kindLabel[it.kind] || '记录') + '</span>\n';
      html += '        </div>\n';
      html += '      </div>\n';
      html += '    </div>\n';
    });
    html += '  </div>\n';
    html += '  <a class="sec-more" href="' + root + 'log/">看全部 ' + totalLogs + ' 条 <span>→</span></a>\n';
  }
  html += '</section>\n';

  /* ============ 最近文章 ============ */
  const posts = locals.posts.sort('-date').limit(4).toArray();
  if (posts.length) {
    html += '<section class="sec">\n';
    html += '  <div class="sec-hd">\n';
    html += '    <h2>最近写的</h2>\n';
    html += '    <p>偶尔，也有想说的话</p>\n';
    html += '  </div>\n';
    html += '  <div class="post-strip">\n';
    posts.forEach(function (post) {
      const cat = post.categories && post.categories.length ? post.categories.first().name : '';
      html += '    <a class="strip-card" href="' + root + post.path + '">\n';
      html += '      <span class="strip-date">' + fmtMD(post.date) + '</span>\n';
      html += '      <span class="strip-title">' + esc(post.title) + '</span>\n';
      if (cat) html += '      <span class="strip-cat">' + esc(cat) + '</span>\n';
      html += '    </a>\n';
    });
    html += '  </div>\n';
    html += '  <a class="sec-more" href="' + root + 'blog/">全部文章 <span>→</span></a>\n';
    html += '</section>\n';
  }

  html += '</div>\n';

  return {
    path: 'index.html',
    data: {
      title: this.config.title,
      content: html,
      comments: false,
      type: 'home'
    },
    layout: 'page'
  };
});
