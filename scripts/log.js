'use strict';

/**
 * /log/ 产出流水完整页
 * 数据来源：source/_data/timeline.json
 */

const fs = require('fs');
const path = require('path');

hexo.extend.generator.register('log-page', function (locals) {
  const root = this.config.root || '/';
  let data = { items: [] };
  try {
    data = JSON.parse(fs.readFileSync(path.join(hexo.base_dir, 'source/_data/timeline.json'), 'utf8'));
  } catch (e) { /* 无数据时渲染空状态 */ }

  const items = data.items || [];
  const esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const fmtMD = function (d) {
    const s = String(d || '');
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[2] + '.' + m[3];
    m = s.match(/^(\d{4})-(\d{2})$/);
    if (m) return m[2] + '月';
    return s;
  };

  const kindIcon = { ship: '↗', build: '◈', doc: '✎', study: '◎' };
  const kindLabel = { ship: '交付', build: '构建', doc: '写作', study: '研究' };
  const projectAccent = {
    '普融智盾': 'green', '羽约小站': 'amber', '五次方的夏天': 'blue'
  };

  // 按项目统计
  const counts = {};
  items.forEach(function (i) { counts[i.project] = (counts[i.project] || 0) + 1; });
  const projList = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
  const spanDays = function () {
    if (!items.length) return 0;
    const ds = items.map(function (i) { return new Date(i.date).getTime(); });
    return Math.round((Math.max.apply(null, ds) - Math.min.apply(null, ds)) / 86400000);
  };

  let html = '';
  html += '<div class="home-v2 log-page">\n';

  html += '<header class="log-hero">\n';
  html += '  <span class="hero-tag"><i class="dot-live"></i>完整记录</span>\n';
  html += '  <h1 class="log-h1">做过的事</h1>\n';
  html += '  <p class="log-lead">按时间倒序。每一条都对应一个真实的动作——上线、交付、或者在某件事上把边界摸清楚了。</p>\n';
  html += '  <div class="log-stats">\n';
  projList.forEach(function (p) {
    const acc = projectAccent[p] || 'slate';
    html += '    <div class="ls acc-' + acc + '"><b>' + counts[p] + '</b><span>' + esc(p) + '</span></div>\n';
  });
  html += '  </div>\n';
  html += '</header>\n';

  html += '<div class="log-filter" id="log-filter">\n';
  html += '  <button class="lf on" data-p="all">全部 <em>' + items.length + '</em></button>\n';
  projList.forEach(function (p) {
    html += '  <button class="lf" data-p="' + esc(p) + '">' + esc(p) + ' <em>' + counts[p] + '</em></button>\n';
  });
  html += '</div>\n';

  if (items.length === 0) {
    html += '<p class="empty">还没有数据。在本地跑 <code>node scripts/gen-timeline.js</code> 后提交即可。</p>\n';
  } else {
    html += '<div class="log-line log-line-full">\n';
    let lastMonth = '';
    items.forEach(function (it) {
      const month = String(it.date).slice(0, 7);
      if (month !== lastMonth) {
        lastMonth = month;
        html += '  <div class="log-month" data-month="' + month + '"><span>' + month.replace('-', '.') + '</span></div>\n';
      }
      const acc = projectAccent[it.project] || 'slate';
      html += '  <div class="log-item" data-p="' + esc(it.project) + '">\n';
      html += '    <div class="log-date"><b>' + fmtMD(it.date) + '</b><span>' + (it.time ? esc(it.time) : '—') + '</span></div>\n';
      html += '    <div class="log-dot acc-' + acc + '"></div>\n';
      html += '    <div class="log-body">\n';
      html += '      <div class="log-title">' + esc(it.title) + '</div>\n';
      html += '      <div class="log-meta">\n';
      html += '        <span class="log-proj acc-' + acc + '">' + esc(it.project) + '</span>\n';
      html += '        <span class="log-kind">' + (kindIcon[it.kind] || '◈') + ' ' + (kindLabel[it.kind] || '记录') + '</span>\n';
      html += '      </div>\n';
      if (it.note) {
        html += '      <p class="log-note-line">' + esc(it.note) + '</p>\n';
      }
      html += '    </div>\n';
      html += '  </div>\n';
    });
    html += '</div>\n';
  }

  html += '<p class="log-note">记录由本地脚本自动整理，不是事后回忆。能被写出来的，都是真做过的。</p>\n';

  const script = '<script>(function(){' +
    'var f=document.getElementById("log-filter");' +
    'if(!f)return;' +
    'f.addEventListener("click",function(e){' +
    'var b=e.target.closest(".lf");if(!b)return;' +
    'var p=b.dataset.p;' +
    'f.querySelectorAll(".lf").forEach(function(x){x.classList.toggle("on",x===b)});' +
    'document.querySelectorAll(".log-item").forEach(function(it){' +
    'it.style.display=(p==="all"||it.dataset.p===p)?"":"none";});' +
    'document.querySelectorAll(".log-month").forEach(function(m){' +
    'var n=m.nextElementSibling,any=false;' +
    'while(n&&!n.classList.contains("log-month")){' +
    'if(n.classList.contains("log-item")&&n.style.display!=="none"){any=true;break}' +
    'n=n.nextElementSibling;}' +
    'm.style.display=any?"":"none";});' +
    '});})();</script>';

  html += script;

  return {
    path: 'log/index.html',
    data: {
      title: '产出流水',
      content: html,
      comments: false,
      type: 'page'
    },
    layout: 'page'
  };
});
