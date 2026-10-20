'use strict';
/**
 * 全量推送（手动通道）：允许推送任意文件改动，包括代码。
 * 与 tools/publish.js 的区别：publish 只同步数据、禁止删除；
 * 本脚本用于发布代码改动，但仍禁止删除文件（防呆）。
 */
const { execSync, spawnSync } = require('child_process');

const OWNER = 'Pentaxia';
const REPO = 'my-blog';
const BRANCH = 'main';
const REPO_DIR = 'C:\\Users\\Yu\\Desktop\\工作\\my-blog';
const DRY = process.argv.includes('--dry');

const sh = (cmd) => execSync(cmd, { cwd: REPO_DIR, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).trim();
const shSafe = (cmd) => { try { return sh(cmd); } catch (e) { return ''; } };

function getToken() {
  const r = spawnSync('git', ['credential', 'fill'], {
    cwd: REPO_DIR, input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8'
  });
  const m = (r.stdout || '').match(/^password=(.+)$/m);
  if (!m) throw new Error('未取到 token');
  return m[1].trim();
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
          'User-Agent': 'pentaxia-fullpush'
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000)
      });
      const txt = await res.text();
      let data;
      try { data = JSON.parse(txt); } catch (e) { data = { raw: txt.slice(0, 200) }; }
      if (res.ok) return data;
      if (res.status >= 500 && i < 2) { await new Promise(s => setTimeout(s, 1000)); continue; }
      throw new Error(method + ' ' + p + ' → ' + res.status + ' ' + JSON.stringify(data).slice(0, 250));
    } catch (e) {
      if (i === 2) throw e;
      await new Promise(s => setTimeout(s, 1000));
    }
  }
}

(async () => {
  const token = getToken();
  console.log('凭据 OK' + (DRY ? '（演练）' : ''));

  const ref = await api(token, 'GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const remoteSha = ref.object.sha;
  const remoteCommit = await api(token, 'GET', `/repos/${OWNER}/${REPO}/git/commits/${remoteSha}`);
  const remoteTree = remoteCommit.tree.sha;
  console.log('远端 HEAD: ' + remoteSha.slice(0, 7));

  const remoteAll = await api(token, 'GET', `/repos/${OWNER}/${REPO}/git/trees/${remoteTree}?recursive=1`);
  const remoteMap = new Map();
  (remoteAll.tree || []).forEach(t => { if (t.type === 'blob') remoteMap.set(t.path, t.sha); });
  console.log('远端文件: ' + remoteMap.size + ' 个');

  const localMap = new Map();
  sh('git -c core.quotepath=false ls-tree -r HEAD').split(/\r?\n/).filter(Boolean).forEach(line => {
    const m = line.match(/^(\d+)\s+blob\s+([0-9a-f]+)\t(.+)$/);
    if (m) localMap.set(m[3], { mode: m[1], sha: m[2] });
  });
  console.log('本地文件: ' + localMap.size + ' 个');

  const changed = [];
  for (const [p, v] of localMap) {
    if (remoteMap.get(p) !== v.sha) changed.push({ path: p, mode: v.mode });
  }

  if (changed.length === 0) {
    console.log('没有差异，无需推送');
    return;
  }

  console.log('待同步: ' + changed.length + ' 个文件');
  changed.slice(0, 30).forEach(f => console.log('  M ' + f.path));
  if (changed.length > 30) console.log('  ... 还有 ' + (changed.length - 30) + ' 个');

  // 防呆：本脚本不删文件。若发现远端有、本地无，只提示不处理
  const missing = [...remoteMap.keys()].filter(p => !localMap.has(p));
  if (missing.length) {
    console.log('\n注意：远端有 ' + missing.length + ' 个本地不存在的文件，本次不会删除：');
    missing.slice(0, 5).forEach(p => console.log('  ? ' + p));
  }

  if (DRY) { console.log('\n[dry] 结束'); return; }

  const entries = [];
  for (const f of changed) {
    const buf = spawnSync('git', ['show', 'HEAD:' + f.path], {
      cwd: REPO_DIR, maxBuffer: 128 * 1024 * 1024
    }).stdout;
    const blob = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
      content: buf.toString('base64'), encoding: 'base64'
    });
    entries.push({ path: f.path, mode: f.mode, type: 'blob', sha: blob.sha });
  }

  const tree = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/trees`, {
    base_tree: remoteTree, tree: entries
  });

  const message = sh('git log -1 --pretty=%B');
  const commit = await api(token, 'POST', `/repos/${OWNER}/${REPO}/git/commits`, {
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
    sha: commit.sha, force: false
  });

  console.log('\n✓ 已推送 ' + changed.length + ' 个文件 → ' + commit.sha.slice(0, 7));
})().catch(e => { console.error('\n失败: ' + e.message); process.exit(1); });
