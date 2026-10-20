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

  // 找本地哪个提交的内容与远端一致（应对 API 提交导致的 SHA 不同）
  const history = sh('git rev-list -50 HEAD').split(/\r?\n/).filter(Boolean);
  let base = null;
  for (const c of history) {
    if (shSafe(`git show -s --format=%T ${c}`) === remoteTree) { base = c; break; }
  }
  if (!base) {
    fail('本地与远端内容对不上，需要先 git fetch 对齐（见 README 排查步骤）');
  }

  const head = sh('git rev-parse HEAD');
  if (base === head && !FORCE) {
    log('      本地与远端一致，无需推送');
    return;
  }

  const diff = sh(`git diff --name-status ${base} ${head}`);
  const files = diff.split(/\r?\n/).filter(Boolean).map(l => {
    const p = l.split('\t');
    return { status: p[0][0], path: p[p.length - 1] };
  });

  const entries = [];
  for (const f of files) {
    let sha = null;
    let mode = '100644';
    if (f.status !== 'D') {
      const buf = spawnSync('git', ['show', 'HEAD:' + f.path], {
        cwd: ROOT, maxBuffer: 128 * 1024 * 1024
      }).stdout;
      const blob = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
        content: buf.toString('base64'), encoding: 'base64'
      });
      sha = blob.sha;
      const tl = shSafe(`git ls-tree HEAD "${f.path}"`);
      if (tl) mode = tl.split(/\s+/)[0];
    }
    entries.push({ path: f.path, mode, type: 'blob', sha });
    log('      ' + f.status + ' ' + f.path);
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
  if (!hasChanges() && !FORCE) {
    log('      没有新记录，跳过');
    log('\n完成（无需发布）');
    return;
  }
  log('      发现新内容');

  if (DRY) {
    log('\n[dry] 以下内容将被提交并推送：');
    log(shSafe('git diff --stat source/_data/'));
    log('\n[dry] 结束');
    return;
  }

  commit();

  const token = getToken();
  if (!token) fail('未找到 GitHub 凭据，无法推送');

  await push(token);
  log('\n✓ 全部完成，Vercel 会自动构建上线');
})().catch(e => {
  console.error('\n✗ 失败：' + e.message);
  process.exit(1);
});
