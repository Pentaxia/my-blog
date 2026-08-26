'use strict';

hexo.extend.helper.register('category_posts', function(name, limit) {
  const cat = this.site.categories.findOne({name: name});
  if (!cat) return [];
  const posts = cat.posts.sort('-date');
  return limit ? posts.limit(limit).toArray() : posts.toArray();
});
