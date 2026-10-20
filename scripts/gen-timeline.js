'use strict';

/**
 * 产出流水生成器
 * 从三个来源聚合「做过什么」，输出 source/_data/timeline.json
 *
 * ⚠️ 重要：本仓库是公开的，timeline.json 会随 git 提交，
 *    所以敏感内容必须在生成阶段就剔除，不能靠前端隐藏。
 *    过滤规则见 scripts/timeline-rules.json
 *
 * 用法：node scripts/gen-timeline.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOME = process.env.USERPROFILE || process.env.HOME;
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'source', '_data', 'timeline.json');

/* ---------- 过滤规则 ---------- */
// 规则分两层：
//   timeline-rules.json        随仓库提交，只放通用规则，不泄露私密偏好
//   timeline-rules.local.json  本地私密词表，不进 git
const RULES = (function () {
  const load = function (file) {
    try {
      return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
    } catch (e) {
      return null;
    }
  };

  const base = load('timeline-rules.json');
  const local = load('timeline-rules.local.json');

  if (!base) {
    console.warn('未找到 timeline-rules.json，使用保守默认：不公开任何条目');
    return { publicProjects: [], blockKeywords: [], redactPatterns: [], manual: [] };
  }

  if (!local) {
    console.log('提示：未找到 timeline-rules.local.json，仅使用通用规则');
  }

  return Object.assign({}, base, {
    blockKeywords: (base.blockKeywords || []).concat((local && local.blockKeywords) || []),
    hiddenItems: (base.hiddenItems || []).concat((local && local.hiddenItems) || []),
    projectRules: (local && local.projectRules) || base.projectRules || null
  });
})();

const PUBLIC_PROJECTS = RULES.publicProjects || [];
const BLOCK_WORDS = RULES.blockKeywords || [];
const REDACT = (RULES.redactPatterns || []).map(function (p) {
  try { return new RegExp(p, 'g'); } catch (e) { return null; }
}).filter(Boolean);
const REWRITES = RULES.rewrites || [];
const HIDDEN = RULES.hiddenItems || [];

// 纯琐碎：命中这些词且没有任何实质成果词，就不占版面
const TRIVIAL_WORDS = (RULES.trivial) || (RULES.scoring && RULES.scoring.trivial) || [];
const SUBSTANTIVE = RULES.substantive || ['上线', '发布', '交付', '上架', '完成', '打通', '结论', '边界', '第一篇', '通过审核'];

function isBlocked(title) {
  return BLOCK_WORDS.some(function (w) { return title.indexOf(w) !== -1; });
}

// 精确点名屏蔽：「2026-10-16|问卷数据」形式
function isHidden(item) {
  return HIDDEN.some(function (rule) {
    const parts = String(rule).split('|');
    if (parts.length < 2) return false;
    const dateOk = parts[0].trim() === item.date;
    const titleOk = item.title.indexOf(parts[1].trim()) !== -1;
    return dateOk && titleOk;
  });
}

function rewrite(title) {
  let t = title;
  REWRITES.forEach(function (r) { t = t.split(r.from).join(r.to); });
  // 「撤销/撤销后」这类替换产生的重复，收一下
  t = t.replace(/(访问限制)限制/g, '$1');
  return t;
}

function redact(title) {
  let t = title;
  REDACT.forEach(function (re) { t = t.replace(re, ''); });
  return t.replace(/\s{2,}/g, ' ').trim();
}

function isTrivial(title) {
  const hasTrivial = TRIVIAL_WORDS.some(function (w) { return title.indexOf(w) !== -1; });
  if (!hasTrivial) return false;
  const hasSubstance = SUBSTANTIVE.some(function (w) { return title.indexOf(w) !== -1; });
  return !hasSubstance;
}

// 太长的标题在时间线上会换行压版面，优先在逗号处断开
function shorten(title) {
  const MAX = 30;
  if (title.length <= MAX) return title;
  const cut = title.search(/[，,；;—]/);
  if (cut >= 10 && cut <= MAX + 4) return title.slice(0, cut);
  return title.slice(0, MAX) + '…';
}

/* ---------- 相似条目合并 ---------- */
// 中文标题句式差异大，Jaccard 不可靠。
// 改用实用规则：同项目 + 日期相近 + 共享 2 个以上关键词 → 视为同一件事
function keywords(s) {
  const t = s.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '');
  const set = new Set();
  for (let i = 0; i < t.length - 1; i++) set.add(t.slice(i, i + 2));
  return set;
}

// 太常见的词不算「关键词」，否则什么都能撞上
const STOP = new Set([
  '上线', '完成', '一个', '这个', '的时', '之后', '以及', '并且', '可以', '进行',
  '通过', '问题', '解决', '支持', '实现', '第一', '第二', '全部', '已经'
]);

function dayDiff(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

function isSameEvent(a, b, minShared) {
  if (a.project !== b.project) return false;
  // 同一天同项目，基本就是在说同一件事，交给里程碑代表
  if (String(a.date) === String(b.date)) return true;
  if (dayDiff(a.date, b.date) > 2) return false;
  const A = keywords(a.title), B = keywords(b.title);
  let shared = 0;
  A.forEach(function (k) {
    if (B.has(k) && !STOP.has(k)) shared++;
  });
  return shared >= (minShared || 2);
}

// 已保留的条目优先：里程碑在前，自动记录在后，被覆盖的直接丢
function dedupeSimilar(items) {
  const out = [];
  items.forEach(function (it) {
    const clash = out.find(function (o) { return isSameEvent(o, it); });
    if (!clash) {
      out.push(it);
    } else if (it.source === 'milestone' && clash.source !== 'milestone') {
      out[out.indexOf(clash)] = it;
    }
    // 否则丢弃当前条目（已被更有代表性的一条覆盖）
  });
  return out;
}

/* ---------- 项目识别 ---------- */
// 注意：这里只列公开项目的识别词。
// 其他分类（个人事务、设备、学业等）的识别词放 timeline-rules.local.json，
// 不写进本文件——否则公开代码里就能看出哪些事被特意排除了。
const PROJECT_RULES = (RULES.projectRules && RULES.projectRules.length) ? RULES.projectRules : [
  { name: '普融智盾', keys: ['普融智盾', '欣悦杯', '挑战杯', '反诈', '问卷', '参赛方案', 'BP'] },
  { name: '羽约小站', keys: ['羽约小站', '羽社通', 'FeatherClub', 'badminton', '云函数', '羽毛球', '羽约'] },
  { name: '五次方的夏天', keys: ['博客', 'pentaxia', 'my-blog', 'Hexo', 'Waline', '换装'] }
];

function detectProject(text) {
  for (const r of PROJECT_RULES) {
    if (r.keys.some(k => text.includes(k))) return r.name;
  }
  return '其他';
}

/* ---------- 类型识别 ---------- */
const KIND_RULES = [
  { kind: 'ship', label: '上线', keys: ['上线', '发布', '交付', '已交付', '上架', '部署', '通过', '完成'] },
  { kind: 'build', label: '构建', keys: ['迁移', '修复', '重构', '实现', '接入', '配置', '打通', '开发', '改', '做'] },
  { kind: 'doc', label: '写作', keys: ['征文', '文档', 'BP', '方案', '报告', '题录', '说明'] },
  { kind: 'study', label: '研究', keys: ['核查', '体检', '审查', '分析', '盘点', '调研', '梳理'] }
];

function detectKind(text) {
  for (const r of KIND_RULES) {
    if (r.keys.some(k => text.includes(k))) return r.kind;
  }
  return 'build';
}

/* ---------- 标题清洗 ---------- */
// 非事件的段落，丢弃
const SKIP = /^(用户背景|已完成|待办|备注|本轮总结|部署状态|环境勘查|身份确认|团队信息|产品说明)/;

// 不算成果的动作（删除、回退、琐碎配置）
const NOISE = /^(删除|移除|去掉|回退|撤销|还原|测试|临时)/;

// 去掉时间前缀和装饰
function cleanTitle(raw) {
  let t = raw.replace(/^##\s*/, '').trim();
  // 20:50–21:10 盘点… / 20:35 状态复查 / （14:11）xxx
  t = t.replace(/^[（(]?\d{1,2}[:：]\d{2}(?:\s*[–\-~至]\s*\d{1,2}[:：]\d{2})?[）)]?\s*/, '');
  // 去掉 emoji 与多余符号
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
  t = t.replace(/^[|｜·・\-\s]+/, '').replace(/\s+/g, ' ');
  // 去掉括号里的补充说明（过长时）
  t = t.replace(/（(?:进行中|已完成|未完成)[^）]*）/g, '').trim();
  // git 提交前缀
  t = t.replace(/^(feat|fix|docs|style|refactor|perf|test|chore|build|ci)\s*[:：]\s*/i, '');
  // 「补充（20:49）：」这类过程性前缀
  t = t.replace(/^(补充|追加)（[^）]*）\s*[：:｜|]?\s*/, '');
  t = t.replace(/^(补充|追加)\s*[：:｜|]\s*/, '');
  t = t.replace(/\s*[（(]\d{1,2}[:：]\d{2}[）)]\s*$/, '');
  // 章节编号 7.1 / 1、
  t = t.replace(/^\d+(\.\d+)*[、.\s]\s*/, '');
  return t;
}

function extractTime(raw) {
  const m = raw.match(/(\d{1,2})[:：](\d{2})/);
  return m ? (m[1].padStart(2, '0') + ':' + m[2]) : '';
}

/* ---------- 来源 1：WorkBuddy 工作日志 ---------- */
function collectWorkBuddy() {
  const base = path.join(HOME, 'WorkBuddy');
  const out = [];
  if (!fs.existsSync(base)) return out;

  for (const ws of fs.readdirSync(base)) {
    const memDir = path.join(base, ws, '.workbuddy', 'memory');
    if (!fs.existsSync(memDir)) continue;

    for (const file of fs.readdirSync(memDir)) {
      const m = file.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
      if (!m) continue;
      const date = m[1];
      const text = fs.readFileSync(path.join(memDir, file), 'utf8');

      for (const line of text.split(/\r?\n/)) {
        if (!/^##\s+/.test(line)) continue;
        const body = line.replace(/^##\s*/, '').trim();
        if (SKIP.test(cleanTitle(body))) continue;

        const title = cleanTitle(body);
        if (title.length < 4) continue;
        if (NOISE.test(title)) continue;

        const project = detectProject(body);
        if (project === '其他') continue;

        out.push({
          date,
          time: extractTime(body),
          title,
          project,
          kind: detectKind(body),
          source: 'workbuddy'
        });
      }
    }
  }
  return out;
}

/* ---------- 来源 2：git 提交 ---------- */
function collectGit() {
  const out = [];
  try {
    const raw = execSync(
      'git log --pretty=format:"%ad|%s" --date=short',
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [date, subject] = line.split('|');
      if (!subject) continue;
      if (/^(Merge|Revert|Update dependabot)/i.test(subject)) continue;

      // 中文提交直接用，英文做轻量映射
      let title = cleanTitle(subject.trim());
      if (NOISE.test(title)) continue;
      if (!/[\u4e00-\u9fa5]/.test(title)) {
        const map = [
          [/dress-up room/i, '换装小屋上线'],
          [/waline/i, '评论系统接入 Waline'],
          [/giscus/i, '评论系统试用 Giscus'],
          [/mascot/i, '吉祥物加载优化'],
          [/myday/i, '私密日程页上线'],
          [/competition log/i, '创赛日志第一篇'],
          [/pipeline/i, '部署管线验证'],
          [/vercel/i, '修复 Vercel 部署'],
          [/init/i, '博客初始化']
        ];
        const hit = map.find(([re]) => re.test(title));
        if (!hit) continue;
        title = hit[1];
      }
      out.push({
        date,
        time: '',
        title: cleanTitle(title),
        project: '五次方的夏天',
        kind: 'build',
        source: 'git'
      });    }
  } catch (e) {
    // git 不可用时静默跳过
  }
  return out;
}

/* ---------- 项目里程碑（来自 projects.json，永远公开） ---------- */
// 里程碑是你自己确认过的成果，不经过敏感词过滤，也不会被自动记录淹没
function collectMilestones() {
  const out = [];
  try {
    const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'source/_data/projects.json'), 'utf8'));
    (p.projects || []).forEach(function (proj) {
      (proj.milestones || []).forEach(function (m) {
        if (!m.date || !m.title) return;
        out.push({
          date: m.date,
          time: '',
          title: m.title,
          note: m.note || '',
          project: proj.name,
          kind: m.kind || 'ship',
          source: 'milestone'
        });
      });
    });
  } catch (e) {
    // 没有 projects.json 就跳过
  }
  return out;
}

/* ---------- 合并去重 ---------- */
function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.date + '|' + it.title.slice(0, 12);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

/* ---------- 隐私过滤 ---------- */
function applyPrivacy(items) {
  const dropped = { project: 0, keyword: 0, trivial: 0 };
  const kept = [];

  for (const raw of items) {
    // 1. 项目白名单：不在名单里的一律不公开
    if (PUBLIC_PROJECTS.indexOf(raw.project) === -1) {
      dropped.project++;
      continue;
    }

    // 2. 被精确点名的条目
    if (isHidden(raw)) {
      dropped.keyword++;
      continue;
    }

    // 3. 敏感词黑名单：出现在标题里就整条丢弃（先查原文，避免脱敏后漏判）
    if (isBlocked(raw.title)) {
      dropped.keyword++;
      continue;
    }

    // 4. 措辞改写 + 脱敏（设备名、时间戳后缀等）
    const title = redact(rewrite(raw.title));
    if (!title || title.length < 4) {
      dropped.keyword++;
      continue;
    }

    // 5. 改写后可能又产生敏感词，再查一次
    if (isBlocked(title)) {
      dropped.keyword++;
      continue;
    }

    // 6. 纯琐碎迭代不占版面
    if (isTrivial(title)) {
      dropped.trivial++;
      continue;
    }

    kept.push(Object.assign({}, raw, { title: shorten(title) }));
  }

  return { kept, dropped };
}

function main() {
  const collected = dedupe([].concat(collectWorkBuddy(), collectGit()));

  // 安全阀：采集不到本地素材时（例如在 Vercel 构建机），
  // 保留已有的 timeline.json，绝不用空数据覆盖
  if (collected.length === 0) {
    if (fs.existsSync(OUT)) {
      console.log('未采集到本地素材，保留现有 timeline.json（跳过生成）');
    } else {
      console.log('未采集到素材，且无历史文件，写入空数据集');
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), total: 0, items: [] }, null, 2), 'utf8');
    }
    return;
  }

  const filtered = applyPrivacy(collected);
  let items = filtered.kept;

  // 里程碑优先：先放里程碑，再放自动采集的（这样相似度合并时会保留里程碑的说法）
  const milestones = collectMilestones();
  items = dedupeSimilar(milestones.concat(items), RULES.dedupeSimilarity || 0.45);
  const merged = milestones.length + filtered.kept.length - items.length;

  // 手工补充的成果（自动采集不到的），永远显示且排在前面
  (RULES.manual || []).forEach(function (m) {
    items.push(Object.assign({ source: 'manual', kind: m.kind || 'ship' }, m));
  });

  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.time || '').localeCompare(a.time || '');
  });

  // 只留最近 120 条，避免无限膨胀
  items = items.slice(0, 120);

  const payload = {
    generated_at: new Date().toISOString(),
    total: items.length,
    items
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');

  console.log('采集 ' + collected.length + ' 条 → 公开 ' + items.length + ' 条');
  console.log('已过滤：项目未授权 ' + filtered.dropped.project +
    ' · 敏感词 ' + filtered.dropped.keyword +
    ' · 琐碎迭代 ' + filtered.dropped.trivial +
    ' · 重复合并 ' + merged);

  const byProject = {};
  items.forEach(i => { byProject[i.project] = (byProject[i.project] || 0) + 1; });
  Object.entries(byProject).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log('  ' + k + ': ' + v);
  });
}

main();
