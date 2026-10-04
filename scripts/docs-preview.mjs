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
      repository('orbit/web', { branch: 'feat/workspace-tabs', upstream: 'origin/feat/workspace-tabs', ahead: 3 }),
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
await mkdir('.dev', { recursive: true })
await writeFile('.dev/readme-data.json', JSON.stringify(data, null, 2))
await writeFile('.dev/readme-preview.html', `<!doctype html>
<html lang="en" class="dark"><head><meta charset="utf-8"><title>Workspace Monitor · sample workspaces</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
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
  if(command==='load_workspaces') return roots;
  if(command==='scan_workspace') return data.snapshots[args.workspaceId];
  if(command==='save_workspaces') {roots=args.workspaces; return null;}
  if(command==='plugin:event|listen') return ++next;
  if(command==='plugin:event|unlisten') return null;
  if(command==='plugin:dialog|open') return null;
  throw new Error('Documentation preview is read-only: '+command);
 }
};
const {default:App} = await import('/src/App.tsx');
createRoot(document.getElementById('root')).render(React.createElement(App));
</script></body></html>`)
console.log('Sample workspaces ready. Start npm run dev, then visit /.dev/readme-preview.html.')
