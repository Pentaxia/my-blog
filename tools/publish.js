'use strict';

/**
 * 自动发布：采集 → 生成 → 提交 → 推送
 *
 * 用法：
 *   node tools/publish.js            正常执行
 *   node tools/publish.js --dry      只看会做什么，不写入
 *   node tools/publish.js --force    即使没有新内容也推送（一般不用）
 *
 * 设计要点：
 * 1. 没新内容就不提交，避免无效构建
 * 2. 推送走 GitHub API（本机 github.com 常被拦，api.github.com 可通）
 * 3. 提交信息带 [auto] 标记，采集时会跳过，不会自我循环
 * 4. 任一步失败都只退出、不破坏现有数据
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OWNER = 'Pentaxia';
const REPO = 'my-blog';
const BRANCH = 'main';

const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');

const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).trim();
const shSafe = (cmd) => {
  try { return sh(cmd); } catch (e) { return ''; }
};

function log(msg) { console.log(msg); }
function fail(msg) { console.error('✗ ' + msg); process.exit(1); }

/* ================= 1. 采集与生成 ================= */
function generate() {
  log('\n[1/4] 采集本地记录');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'gen-timeline.js')], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
  });
  const out = (r.stdout || '').trim();
  if (out) out.split(/\r?\n/).forEach(l => log('      ' + l));
  if (r.status !== 0) {
    console.error((r.stderr || '').slice(0, 500));
    fail('采集脚本执行失败');
  }
}

/* ================= 2. 检查变化 ================= */
function hasChanges() {
  const status = shSafe('git status --porcelain source/_data/timeline.json source/_data/projects.json');
  return status.length > 0;
}

/* ================= 3. 本地提交 ================= */
function commit() {
  log('\n[3/4] 本地提交');
  const date = new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
  sh('git add source/_data/timeline.json source/_data/projects.json');
  const msg = `[auto] 更新产出记录 ${date}`;
  const r = spawnSync('git', ['-c', 'user.name=Pentaxia', '-c', 'user.email=1413115996@qq.com',
    'commit', '-m', msg], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    log('      ' + ((r.stdout || '') + (r.stderr || '')).trim().slice(0, 200));
    fail('提交失败');
  }
  log('      ✓ ' + msg);
}

/* ================= 4. 通过 API 推送 ================= */
function getToken() {
  const r = spawnSync('git', ['credential', 'fill'], {
    cwd: ROOT, input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8'
  });
  const m = (r.stdout || '').match(/^password=(.+)$/m);
  return m ? m[1].trim() : null;
}

async function api(token, method, p, body) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch('https://api.github.com' + p, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'pentaxia-autopublish'
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000)
      });
      const txt = await res.text();
      let data;
      try { data = JSON.parse(txt); } catch (e) { data = { raw: txt.slice(0, 200) }; }
      if (res.ok) return data;
      if (res.status >= 500 && i < 2) { await new Promise(s => setTimeout(s, 1000)); continue; }
      throw new Error(method + ' ' + p + ' → ' + res.status + ' ' + JSON.stringify(data).slice(0, 200));
    } catch (e) {
      if (i === 2) throw e;
      await new Promise(s => setTimeout(s, 1000));
    }
  }
}

async function push(token) {
  log('\n[4/4] 推送到 GitHub');

  const ref = await api(token, 'GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const remoteSha = ref.object.sha;
  const remoteCommit = await api(token, 'GET', `/repos/${OWNER}/${REPO}/git/commits/${remoteSha}`);
  const remoteTree = remoteCommit.tree.sha;

  // 不依赖提交历史对齐（API 提交会让本地缺失对应 SHA）。
  // 直接做文件级比对：远端 tree 的每个 blob sha vs 本地 tree 的 blob sha。
  const remoteAll = await api(token, 'GET',
    `/repos/${OWNER}/${REPO}/git/trees/${remoteTree}?recursive=1`);
  const remoteMap = new Map();
  (remoteAll.tree || []).forEach(t => { if (t.type === 'blob') remoteMap.set(t.path, t.sha); });

  const localMap = new Map();
  // core.quotepath=false：否则中文路径会被转义成 \345\202...，导致误判文件不存在
  sh('git -c core.quotepath=false ls-tree -r HEAD').split(/\r?\n/).filter(Boolean).forEach(line => {
    const m = line.match(/^(\d+)\s+blob\s+([0-9a-f]+)\t(.+)$/);
    if (m) localMap.set(m[3], { mode: m[1], sha: m[2] });
  });

  // 需要上传/更新的文件
  const changed = [];
  for (const [p, v] of localMap) {
    if (remoteMap.get(p) !== v.sha) changed.push({ path: p, mode: v.mode, sha: v.sha });
  }

  // 自动发布不做任何删除。
  // 教训：曾因中文路径被 git 转义成 \345\202... 导致误判「文件已不存在」，
  // 一次性删掉了线上 7 篇文章。删除是人的决定，不该由脚本代劳。
  if (changed.length === 0 && !FORCE) {
    log('      远端内容已是最新，无需推送');
    return;
  }

  // 安全阀：自动发布只应该动数据文件。一旦发现要改文章或大量文件，
  // 说明状态异常，立即中止而不是硬推上去。
  const ALLOWED = /^source\/_data\/(timeline|projects)\.json$/;
  const unexpected = changed.filter(f => !ALLOWED.test(f.path));
  if (unexpected.length > 0) {
    log('\n      ⚠ 检测到非数据文件的变化，已中止：');
    unexpected.slice(0, 10).forEach(f => log('        ' + f.path));
    if (unexpected.length > 10) log('        ... 还有 ' + (unexpected.length - 10) + ' 个');
    log('      自动发布只同步 timeline.json 和 projects.json。');
    log('      其他改动请用 git push 手动发布。');
    process.exit(2);
  }

  const entries = [];
  for (const f of changed) {
    const buf = spawnSync('git', ['show', 'HEAD:' + f.path], {
      cwd: ROOT, maxBuffer: 128 * 1024 * 1024
    }).stdout;
    if (!buf || buf.length === 0) {
      const chk = spawnSync('git', ['cat-file', '-e', 'HEAD:' + f.path], { cwd: ROOT });
      if (chk.status !== 0) { log('      ! 跳过（读不到）' + f.path); continue; }
    }
    const blob = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: buf.toString('base64'), encoding: 'base64'
    });
    entries.push({ path: f.path, mode: f.mode, type: 'blob', sha: blob.sha });
    log('      M ' + f.path);
  }

  if (entries.length === 0) {
    log('      没有需要同步的内容');
    return;
  }

  const tree = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/trees`, {
    base_tree: remoteTree, tree: entries
  });

  const message = sh('git log -1 --pretty=%B');
  const newCommit = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [remoteSha],
    author: {
      name: sh('git log -1 --pretty=%an'),
      email: sh('git log -1 --pretty=%ae'),
      date: sh('git log -1 --pretty=%aI')
    }
  });

  await api(token, 'PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    sha: newCommit.sha, force: false
  });

  log('      ✓ 已推送 ' + newCommit.sha.slice(0, 7));
}

/* ================= 主流程 ================= */
(async () => {
  log('===== 博客自动发布 =====');
  log('时间：' + new Date().toLocaleString('zh-CN'));

  generate();

  log('\n[2/4] 检查是否有新内容');
  const dirty = hasChanges();
  if (dirty) {
    log('      发现新记录');
  } else {
    log('      本地记录无变化');
  }

  if (DRY) {
    log('\n[dry] 工作区变化：');
    log(dirty ? shSafe('git diff --stat source/_data/') : '  （无）');
    log('\n[dry] 结束');
    return;
  }

  if (dirty) commit();

  // 即使本地没变化，也要检查远端是否落后（可能上次推送中断）
  const token = getToken();
  if (!token) fail('未找到 GitHub 凭据，无法推送');

  log('\n[3/4] 检查远端状态');
  await push(token);
  log('\n✓ 全部完成，Vercel 会自动构建上线');
})().catch(e => {
  console.error('\n✗ 失败：' + e.message);
  process.exit(1);
});
