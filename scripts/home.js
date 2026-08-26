'use strict';

hexo.extend.generator.register('home', function(locals) {
  var root = this.config.root || '/';
  var lifeCat = locals.categories.findOne({name: '生活'});
  const compCat = locals.categories.findOne({name: '创赛日志'});

  const lifePosts = lifeCat ? lifeCat.posts.sort('-date').limit(3).toArray() : [];
  const compPosts = compCat ? compCat.posts.sort('-date').limit(3).toArray() : [];

  const fmtDate = function(d) {
    if (d && typeof d.format === 'function') return d.format('MM-DD');
    if (d instanceof Date) {
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return m + '-' + day;
    }
    return '';
  };

  const esc = function(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  let html = '<div class="home-sections">\n';

  // 生活文章板块
  html += '<section class="home-section">\n';
  html += '  <div class="home-section-header">\n';
  html += '    <h2 class="home-section-title"><i class="home-section-icon fa fa-leaf"></i>生活文章</h2>\n';
  html += '    <p class="home-section-desc">日常、随想与碎碎念</p>\n';
  html += '  </div>\n';
  html += '  <div class="home-post-list">\n';
  if (lifePosts.length === 0) {
    html += '    <p class="home-empty">还没有文章，敬请期待。</p>\n';
  }
  lifePosts.forEach(function(post) {
    var tagHtml = '';
    if (post.tags && post.tags.length > 0) {
      tagHtml = '<span class="home-post-tag">' + esc(post.tags.first().name) + '</span>';
    }
    html += '    <article class="home-post-card">\n';
    html += '      <a href="' + root + post.path + '" class="home-post-link">\n';
    html += '        <span class="home-post-date">' + fmtDate(post.date) + '</span>\n';
    html += '        <span class="home-post-title">' + esc(post.title) + '</span>\n';
    html += '        ' + tagHtml + '\n';
    html += '      </a>\n';
    html += '    </article>\n';
  });
  html += '  </div>\n';
  html += '  <a href="/categories/生活/" class="home-more-btn">查看全部 &rarr;</a>\n';
  html += '</section>\n';

  // 创赛日志板块
  html += '<section class="home-section">\n';
  html += '  <div class="home-section-header">\n';
  html += '    <h2 class="home-section-title"><i class="home-section-icon fa fa-trophy"></i>创赛日志</h2>\n';
  html += '    <p class="home-section-desc">创新创业大赛的进度、思考与复盘</p>\n';
  html += '  </div>\n';
  html += '  <div class="home-post-list">\n';
  if (compPosts.length === 0) {
    html += '    <p class="home-empty">还没有日志，敬请期待。</p>\n';
  }
  compPosts.forEach(function(post) {
    var tagHtml = '';
    if (post.tags && post.tags.length > 0) {
      tagHtml = '<span class="home-post-tag">' + esc(post.tags.first().name) + '</span>';
    }
    html += '    <article class="home-post-card">\n';
    html += '      <a href="' + root + post.path + '" class="home-post-link">\n';
    html += '        <span class="home-post-date">' + fmtDate(post.date) + '</span>\n';
    html += '        <span class="home-post-title">' + esc(post.title) + '</span>\n';
    html += '        ' + tagHtml + '\n';
    html += '      </a>\n';
    html += '    </article>\n';
  });
  html += '  </div>\n';
  html += '  <a href="/categories/创赛日志/" class="home-more-btn">查看全部 &rarr;</a>\n';
  html += '</section>\n';

  html += '</div>\n';

  return {
    path: 'index.html',
    data: {
      title: '五次方的夏天',
      date: new Date(),
      content: html,
      comments: false,
      type: 'home'
    },
    layout: 'page'
  };
});
