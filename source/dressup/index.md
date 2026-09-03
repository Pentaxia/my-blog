---
title: 换装小屋
date: 2026-09-03 12:00:00
---

<style>
#dressup-app{max-width:860px;margin:0 auto;font-family:inherit}
.dressup-header{text-align:center;margin-bottom:24px}
.dressup-header h2{color:#2d4a32;font-size:1.6em;margin:0 0 6px}
.dressup-header p{color:#7a9b7e;margin:0;font-size:.95em}
.dressup-stage{display:flex;justify-content:center;align-items:flex-end;gap:8%;background:linear-gradient(180deg,#f2f8ee 0%,#e6f0dd 70%,#d8e8cb 100%);border:1px solid #c5d4be;border-radius:18px;padding:34px 20px 26px;margin-bottom:26px;position:relative;overflow:hidden}
.dressup-stage::after{content:'';position:absolute;left:-40px;right:-40px;bottom:-50px;height:90px;background:#cfe3c0;border-radius:50%}
.dressup-figure{position:relative;z-index:1;text-align:center}
.dressup-figure img{height:300px;width:auto;max-width:42vw;object-fit:contain;filter:drop-shadow(0 8px 12px rgba(74,124,89,.25));animation:dressupFloat 3.2s ease-in-out infinite}
.dressup-figure:nth-child(2) img{animation-delay:1.6s}
.dressup-fig-name{margin-top:10px;font-size:.95em;color:#2d4a32;background:rgba(255,255,255,.85);border:1px solid #c5d4be;border-radius:20px;padding:4px 16px;display:inline-block}
@keyframes dressupFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
.dressup-tabs{display:flex;justify-content:center;gap:12px;margin-bottom:18px}
.dressup-tab{border:1px solid #c5d4be;background:#fff;color:#2d4a32;border-radius:24px;padding:8px 22px;font-size:1em;cursor:pointer;transition:all .2s}
.dressup-tab:hover{background:#e6ecde}
.dressup-tab.active{background:#4a7c59;border-color:#4a7c59;color:#fff}
.dressup-wardrobe{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px;margin-bottom:22px}
.dressup-card{border:2px solid #dfe8da;background:#fff;border-radius:14px;padding:10px 8px 12px;text-align:center;cursor:pointer;transition:all .2s;position:relative}
.dressup-card:hover{transform:translateY(-4px);box-shadow:0 6px 14px rgba(74,124,89,.15);border-color:#8db580}
.dressup-card img{width:100%;height:150px;object-fit:contain}
.dressup-card .dressup-card-name{font-size:.9em;color:#2d4a32;margin-top:6px}
.dressup-card.active{border-color:#4a7c59;background:#f0f6ea;box-shadow:0 4px 12px rgba(74,124,89,.18)}
.dressup-card.active::after{content:'✓ 穿着中';position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#4a7c59;color:#fff;font-size:.72em;padding:2px 10px;border-radius:10px;white-space:nowrap}
.dressup-card.active .dressup-card-name{color:#4a7c59;font-weight:600}
.dressup-actions{text-align:center;margin-bottom:10px}
.dressup-actions button{border:none;background:#e8f0e3;color:#4a7c59;border-radius:20px;padding:8px 20px;font-size:.92em;cursor:pointer;transition:background .2s}
.dressup-actions button:hover{background:#d8e8cb}
.dressup-hint{display:block;margin-top:12px;text-align:center;font-size:.88em;color:#7a9b7e;min-height:1.4em}
@media(max-width:560px){.dressup-figure img{height:190px}.dressup-wardrobe{grid-template-columns:repeat(2,1fr)}}
</style>

<div id="dressup-app">
  <div class="dressup-header">
    <h2>换装小屋</h2>
    <p>给小向导们挑一身新衣服吧~ 换好的造型会出现在博客的每个角落哦</p>
  </div>

  <div class="dressup-stage">
    <div class="dressup-figure">
      <img id="dressup-girl-preview" alt="薄荷女孩" />
      <div class="dressup-fig-name" id="dressup-girl-name"></div>
    </div>
    <div class="dressup-figure">
      <img id="dressup-boy-preview" alt="甜橙男孩" />
      <div class="dressup-fig-name" id="dressup-boy-name"></div>
    </div>
  </div>

  <div class="dressup-tabs">
    <button class="dressup-tab active" data-role="girl" type="button">薄荷女孩</button>
    <button class="dressup-tab" data-role="boy" type="button">甜橙男孩</button>
  </div>

  <div class="dressup-wardrobe" id="dressup-wardrobe"></div>

  <div class="dressup-actions">
    <button id="dressup-reset" type="button">恢复季节默认</button>
    <span class="dressup-hint" id="dressup-hint"></span>
  </div>
</div>

<script>
(function () {
  var OUTFITS = {
    girl: [
      { id: '', name: '季节限定', desc: '跟着四季换装' },
      { id: 'jk', name: 'JK制服' },
      { id: 'hoodie', name: '慵懒卫衣' },
      { id: 'dress', name: '田园碎花裙' },
      { id: 'lolita', name: '洛丽塔' },
      { id: 'witch', name: '小魔女' },
      { id: 'chef', name: '小厨师' },
      { id: 'hanfu', name: '汉服' },
      { id: 'sporty', name: '运动少女' },
      { id: 'nurse', name: '小护士' },
      { id: 'raincoat', name: '雨天小雨衣' }
    ],
    boy: [
      { id: '', name: '季节限定', desc: '跟着四季换装' },
      { id: 'uniform', name: '学院制服' },
      { id: 'hoodie', name: '滑板少年' },
      { id: 'denim', name: '田园背带裤' },
      { id: 'prince', name: '小王子' },
      { id: 'wizard', name: '小魔法师' },
      { id: 'chef', name: '小厨师' },
      { id: 'hanfu', name: '汉服少年' },
      { id: 'sporty', name: '篮球少年' },
      { id: 'doctor', name: '小医生' },
      { id: 'raincoat', name: '雨天小雨衣' }
    ]
  };
  var ROLE_NAMES = { girl: '薄荷女孩', boy: '甜橙男孩' };

  var month = new Date().getMonth() + 1;
  var season = 'winter';
  if (month >= 3 && month <= 5) season = 'spring';
  else if (month >= 6 && month <= 8) season = 'summer';
  else if (month >= 9 && month <= 11) season = 'autumn';
  var seasonSuffix = season === 'summer' ? '' : '-' + season;

  function imgPath(role, id) {
    return id ? '/images/dressup-' + role + '-' + id + '.png'
              : '/images/mascot-' + role + seasonSuffix + '.png';
  }
  function thumbPath(role, id) {
    return id ? '/images/dressup-' + role + '-' + id + '-thumb.png'
              : '/images/mascot-' + role + seasonSuffix + '-thumb.png';
  }
  function outfitName(role, id) {
    var list = OUTFITS[role];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
    return '';
  }
  function saved(role) { return localStorage.getItem('dressup-' + role) || ''; }

  var activeRole = 'girl';
  var wardrobe = document.getElementById('dressup-wardrobe');
  var hint = document.getElementById('dressup-hint');
  var hintTimer = null;

  function refreshStage() {
    var gid = saved('girl'), bid = saved('boy');
    document.getElementById('dressup-girl-preview').src = imgPath('girl', gid);
    document.getElementById('dressup-boy-preview').src = imgPath('boy', bid);
    document.getElementById('dressup-girl-name').textContent = ROLE_NAMES.girl + ' · ' + (outfitName('girl', gid) || '季节限定');
    document.getElementById('dressup-boy-name').textContent = ROLE_NAMES.boy + ' · ' + (outfitName('boy', bid) || '季节限定');
  }

  function renderWardrobe() {
    wardrobe.innerHTML = '';
    var current = saved(activeRole);
    OUTFITS[activeRole].forEach(function (o) {
      var card = document.createElement('div');
      card.className = 'dressup-card' + (o.id === current ? ' active' : '');
      var img = document.createElement('img');
      img.src = thumbPath(activeRole, o.id);
      img.alt = o.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      var nm = document.createElement('div');
      nm.className = 'dressup-card-name';
      nm.textContent = o.name;
      card.appendChild(img);
      card.appendChild(nm);
      card.addEventListener('click', function () {
        if (o.id) localStorage.setItem('dressup-' + activeRole, o.id);
        else localStorage.removeItem('dressup-' + activeRole);
        renderWardrobe();
        refreshStage();
        showHint('已换上「' + o.name + '」！去首页和文章页看看吧~');
      });
      wardrobe.appendChild(card);
    });
  }

  function showHint(text) {
    hint.textContent = text;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.textContent = ''; }, 4000);
  }

  document.querySelectorAll('.dressup-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.dressup-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeRole = tab.getAttribute('data-role');
      renderWardrobe();
    });
  });

  document.getElementById('dressup-reset').addEventListener('click', function () {
    localStorage.removeItem('dressup-girl');
    localStorage.removeItem('dressup-boy');
    renderWardrobe();
    refreshStage();
    showHint('已恢复季节默认装扮~');
  });

  renderWardrobe();
  refreshStage();
})();
</script>
