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
  const id = projects.identity || {};

  html += '<div class="home-v2">\n';
  html += '<section class="hero">\n';
  html += '  <div class="hero-copy">\n';
  html += '    <span class="hero-tag"><i class="dot-live"></i>' + esc(id.school || '') + ' · ' + esc(id.major || '') + '</span>\n';
  html += '    <h1 class="hero-title">' + (id.headline || '做过的事，<br>都留在这里') + '</h1>\n';
  html += '    <p class="hero-sub">' + esc(id.lead || '') + '</p>\n';

  const facts = id.facts || [];
  if (facts.length) {
    html += '    <div class="hero-facts">\n';
    facts.forEach(function (f) {
      html += '      <div class="hf"><b>' + esc(f.value) + '</b><span>' + esc(f.label) + '</span></div>\n';
    });
    html += '    </div>\n';
  }

  html += '    <div class="hero-actions">\n';
  html += '      <a class="btn-solid" href="#works">看作品 <span>↓</span></a>\n';
  html += '      <a class="btn-line" href="#journey">做过的事</a>\n';
  html += '    </div>\n';
  html += '  </div>\n';
  html += '  <div class="hero-art">\n';
  html += '    <div class="hero-blob"></div>\n';
  html += '    <img class="hero-mascot" src="' + root + 'images/mascot-girl.png" alt="" loading="eager">\n';
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
    // 「怎么验证」比「我做了什么」更有说服力
    if (p.verify && p.verify.label) {
      const vk = p.verify.kind || 'search';
      html += '        <div class="work-verify vk-' + vk + '">\n';
      html += '          <span class="vk-dot"></span>' + esc(p.verify.label) + '\n';
      html += '        </div>\n';
    }
    html += '      </div>\n';
    html += '    </article>\n';
  });

  html += '  </div>\n';
  html += '</section>\n';

  /* ============ 做过的事（精选里程碑） ============ */
  // 首页只放有分量的节点：带说明的里程碑优先，朴素的自动记录不占版面
  const allItems = timeline.items || [];
  const withNote = allItems.filter(function (it) { return it.note; });
  const noNote = allItems.filter(function (it) { return !it.note; });
  const items = withNote.concat(noNote).slice(0, 6);

  html += '<section class="sec sec-log" id="journey">\n';
  html += '  <div class="sec-hd">\n';
  html += '    <h2>做过的事</h2>\n';
  html += '    <p>按时间倒序，每条都能对应到一个上线的东西</p>\n';
  html += '  </div>\n';

  if (items.length === 0) {
    html += '  <p class="empty">还没有记录。</p>\n';
  } else {
    html += '  <div class="mile">\n';
    items.forEach(function (it) {
      const acc = projectAccent[it.project] || 'slate';
      html += '    <article class="mile-item reveal acc-' + acc + '">\n';
      html += '      <div class="mile-side">\n';
      html += '        <span class="mile-date">' + fmtMD(it.date) + '</span>\n';
      html += '        <span class="mile-proj">' + esc(it.project) + '</span>\n';
      html += '      </div>\n';
      html += '      <div class="mile-main">\n';
      html += '        <h3 class="mile-title">' + esc(it.title) + '</h3>\n';
      if (it.note) html += '        <p class="mile-note">' + esc(it.note) + '</p>\n';
      html += '      </div>\n';
      html += '    </article>\n';
    });
    html += '  </div>\n';
    if (allItems.length > items.length) {
      html += '  <a class="sec-more" href="' + root + 'log/">完整记录 ' + allItems.length + ' 条 <span>→</span></a>\n';
    }
  }
  html += '</section>\n';

  /* ============ 最近写的 ============ */
  // 首页是门面，只放和项目有关的文章（创赛日志等）。
  // 生活随笔留在 /blog/ 里，想看的人自己点进去——不在首页占版面。
  const allPosts = locals.posts.sort('-date').toArray();
  const catOf = function (p) {
    return (p.categories && p.categories.length) ? p.categories.first().name : '';
  };
  const workPosts = allPosts.filter(function (p) { return catOf(p) !== '生活'; }).slice(0, 4);

  if (workPosts.length >= 1) {
    html += '<section class="sec">\n';
    html += '  <div class="sec-hd">\n';
    html += '    <h2>也写一点</h2>\n';
    html += '    <p>项目进展和过程中的判断</p>\n';
    html += '  </div>\n';
    html += '  <div class="post-strip">\n';
    workPosts.forEach(function (post) {
      const cat = catOf(post);
      html += '    <a class="strip-card" href="' + root + post.path + '">\n';
      html += '      <span class="strip-date">' + fmtMD(post.date) + '</span>\n';
      html += '      <span class="strip-title">' + esc(post.title) + '</span>\n';
      if (cat) html += '      <span class="strip-cat">' + esc(cat) + '</span>\n';
      html += '    </a>\n';
    });
    html += '  </div>\n';
    html += '  <a class="sec-more" href="' + root + 'blog/">全部 ' + allPosts.length + ' 篇 <span>→</span></a>\n';
    html += '</section>\n';
  }

  html += '</div>\n';

  return {
    path: 'index.html',
    data: {
      title: this.config.title,
      description: (projects.identity && projects.identity.lead) || this.config.description,
      photos: [this.config.url + '/images/mascot-girl.png'],
      content: html,
      comments: false,
      type: 'home'
    },
    layout: 'page'
  };
});
