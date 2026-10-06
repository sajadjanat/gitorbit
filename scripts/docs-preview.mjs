// Documentation-only fixtures. The desktop app always reads actual Git state.
import { mkdir, writeFile } from 'node:fs/promises'

const workspaces = [
  { id: 'studio', name: 'Studio', path: 'C:/Workspaces/studio', autoFetch: false },
  { id: 'products', name: 'Products', path: 'C:/Workspaces/products', autoFetch: true },
]
const repository = (name, patch = {}) => ({
  path: `C:/Workspaces/studio/${name}`, name, branch: 'main', upstream: 'origin/main',
  changed: 0, staged: 0, unstaged: 0, untracked: 0, conflicts: 0, ahead: 0, behind: 0,
  detached: false, files: [], error: null, fetchError: null, ...patch,
})
const files = [
  { path: 'src/routes/projects.ts', originalPath: null, status: ' M' },
  { path: 'src/services/workspace.ts', originalPath: null, status: ' M' },
  { path: 'package.json', originalPath: null, status: 'M ' },
  { path: 'tests/projects.test.ts', originalPath: null, status: '??' },
]
const now = Date.now()
const snapshot = (id, repositories) => ({ workspaceId: id, repositories, scannedAt: now, fetchedAt: now - 45_000, diagnostics: [] })
const data = {
  workspaces,
  environment: {
    platform: 'windows', gitVersion: 'git version 2.51.0', gitPath: 'git.exe',
    installer: { available: true, description: 'Install Git using Windows Package Manager. Windows may ask for permission.', command: 'winget install --id Git.Git --exact', downloadUrl: 'https://git-scm.com/install/windows', systemPrompt: false },
  },
  snapshots: {
    studio: snapshot('studio', [
      repository('orbit/api', { changed: 4, staged: 1, unstaged: 2, untracked: 1, files }),
      repository('orbit/web', { branch: 'feat/workspace-tabs', upstream: 'origin/feat/workspace-tabs', ahead: 2 }),
      repository('atlas/site', { behind: 2 }),
      repository('nova/mobile', { ahead: 1, behind: 2 }),
      repository('metrics', { changed: 1, conflicts: 1, staged: 1, unstaged: 1, files: [{ path: 'src/config.ts', originalPath: null, status: 'UU' }] }),
      repository('notes', { upstream: null, ahead: null, behind: null }),
      repository('docs/website'),
      repository('workspace-monitor'),
    ]),
    products: snapshot('products', [repository('customer-portal', { changed: 2 }), repository('billing-api')]),
  },
}
const commit = (hash, parents, subject, index) => ({ hash: hash.padEnd(40, '0'), parents: parents.map(p => p.padEnd(40, '0')), subject, author: 'Demo Author', timestamp: 1791102000 - index * 3600 });
data.history = {
  commits: [
    commit('a1', ['b1'], 'feat(workspace): add repository version control', 0),
    commit('b1', ['c1', 'd1'], 'merge: integrate feature/git-graph', 1),
    commit('d1', ['d2'], 'feat(graph): show branch labels and merge lanes', 2),
    commit('d2', ['e1'], 'feat(graph): render commit parent connections', 3),
    commit('c1', ['c2', 'f1'], 'merge: integrate feature/themes', 4),
    commit('f1', ['f2'], 'feat(themes): add ocean, violet and forest palettes', 5),
    commit('f2', ['e1'], 'feat(themes): add light mode and custom accent', 6),
    commit('c2', ['e1'], 'fix(monitor): keep inactive workspaces up to date', 7),
    commit('e1', ['e2'], 'feat(workspaces): persist workspace tabs', 8),
    commit('e2', ['e3'], 'feat(git): show push and pull counts', 9),
    commit('e3', ['e4'], 'feat(ui): add compact repository table', 10),
    commit('e4', [], 'Initial commit', 11),
  ],
  refs: [
    { hash: 'a1'.padEnd(40, '0'), name: 'main', kind: 'branch' },
    { hash: 'a1'.padEnd(40, '0'), name: 'origin/main', kind: 'remote' },
    { hash: 'd1'.padEnd(40, '0'), name: 'feature/git-graph', kind: 'branch' },
    { hash: 'f1'.padEnd(40, '0'), name: 'feature/themes', kind: 'branch' },
    { hash: 'e1'.padEnd(40, '0'), name: 'v0.1.0', kind: 'tag' },
  ],
  head: 'a1'.padEnd(40, '0'), hasMore: false, shallow: false,
};
data.outgoing = {
  head: 'a1'.padEnd(40, '0'), upstreamHead: 'c1'.padEnd(40, '0'), sourceBranch: 'feat/workspace-tabs', remote: 'origin', destinationBranch: 'feat/workspace-tabs',
  totalCommits: 2, hasMore: false, commits: [
    commit('a1', ['b1'], 'feat(workspace): refresh all workspaces together', 0),
    commit('b1', ['c1'], 'feat(ui): add workspace tabs', 1),
  ],
};
data.commitFiles = [
  {path: 'src/services/workspace.ts', originalPath: null, status: 'M'},
  {path: 'src/components/workspace-tabs.tsx', originalPath: null, status: 'A'},
  {path: 'src/lib/preferences.ts', originalPath: 'src/lib/settings.ts', status: 'R100'},
];
await mkdir('.dev', { recursive: true })
await writeFile('.dev/readme-data.json', JSON.stringify(data, null, 2))
await writeFile('.dev/readme-preview.html', `<!doctype html>
<html lang="en" class="dark"><head><meta charset="utf-8"><title>GitOrbit · sample workspaces</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
const data = await (await fetch('/.dev/readme-data.json')).json();
if (new URLSearchParams(location.search).get('git') === 'missing') { data.environment.gitVersion = null; data.environment.gitPath = null; }
window.isTauri = true;
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
let roots = data.workspaces; let next = 0;
window.__TAURI_INTERNALS__ = {
 transformCallback: () => ++next,
 invoke: async (command,args) => {
  if(command==='check_environment') return data.environment;
  if(command==='update_connection') return 'system';
  if(command==='save_update_connection') return null;
  if(command==='check_app_update') return new URLSearchParams(location.search).get('update') === 'available' ? { rid: 99, currentVersion: '0.3.1', version: '0.4.0', body: 'A new GitOrbit release is ready.\\n\\n• Faster repository scans\\n• Improved Git graph navigation', rawJson: {} } : null;
  if(command==='load_workspaces') return roots;
  if(command==='scan_workspace') return data.snapshots[args.workspaceId];
  if(command==='repository_history') return data.history;
  if(command==='repository_outgoing') return data.outgoing;
  if(command==='repository_commit_files') return data.commitFiles;
  if(command==='repository_commit_diff') {
    const file = data.commitFiles.find(file => file.path === args.file);
    const text = file.status === 'A' ? 'diff --git a/'+args.file+' b/'+args.file+'\\nnew file mode 100644\\n--- /dev/null\\n+++ b/'+args.file+'\\n@@ -0,0 +1,3 @@\\n+export function WorkspaceTabs() {\\n+  return <nav aria-label="Workspaces" />;\\n+}' : file.originalPath ? 'diff --git a/'+file.originalPath+' b/'+file.path+'\\nsimilarity index 100%\\nrename from '+file.originalPath+'\\nrename to '+file.path : 'diff --git a/'+args.file+' b/'+args.file+'\\n--- a/'+args.file+'\\n+++ b/'+args.file+'\\n@@ -1,3 +1,4 @@\\n export function refreshWorkspace() {\\n-  return scan(activeWorkspace);\\n+  return Promise.all(workspaces.map(scan));\\n+  // Keep every workspace up to date.\\n }';
    return { beforeRevision: args.commitHash === data.outgoing.head ? 'b1'.padEnd(40, '0') : 'c1'.padEnd(40, '0'), afterRevision: args.commitHash, text, truncated: false };
  }
  if(command==='repository_changes') return data.snapshots.studio.repositories[0];
  if(command==='repository_diff') return { text: 'diff --git a/'+args.file+' b/'+args.file+'\\n--- a/'+args.file+'\\n+++ b/'+args.file+'\\n@@ -1,4 +1,5 @@\\n export function refreshWorkspace() {\\n-  return scan(activeWorkspace);\\n+  return Promise.all(workspaces.map(scan));\\n+  // Keep every workspace up to date.\\n }', truncated: false };
  if(command==='save_workspaces') {roots=args.workspaces; return null;}
  if(command==='plugin:event|listen') return ++next;
  if(command==='plugin:event|unlisten') return null;
  if(command==='plugin:dialog|open') return null;
  throw new Error('Documentation preview is read-only: '+command);
 }
};
const {default:App} = await import('/src/App.tsx');
const {LanguageProvider,setLanguage,languages} = await import('/src/lib/i18n.tsx');
const previewLanguage = new URLSearchParams(location.search).get('lang');
if(languages.some(language => language.id === previewLanguage)) setLanguage(previewLanguage);
createRoot(document.getElementById('root')).render(React.createElement(LanguageProvider,null,React.createElement(App)));
</script></body></html>`)
console.log('Sample workspaces ready. Start npm run dev, then visit /.dev/readme-preview.html.')
