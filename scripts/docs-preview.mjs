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
// Opt-in media fixtures exercise the actual preview components without Git writes.
data.mediaFiles = [
  {path:'assets/workspace-preview.png',originalPath:null,status:' M'},
  {path:'docs/getting-started.pdf',originalPath:null,status:'??'},
  {path:'assets/orbit-mark.svg',originalPath:null,status:'??'},
  {path:'app/Http/Controllers/TicketController.php',originalPath:null,status:' M'},
  {path:'resources/views/show.blade.php',originalPath:null,status:' M'},
  {path:'AGENTS.md',originalPath:null,status:' M'},
  {path:'content/catalog.json',originalPath:null,status:'M '},
  {path:'src/App.tsx',originalPath:null,status:' M'},
  {path:'backup/archive.zip',originalPath:null,status:'??'},
];
const sampleImage = accent => `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="580" viewBox="0 0 960 580"><rect x="40" y="40" width="880" height="500" rx="28" fill="#14171e"/><circle cx="84" cy="80" r="6" fill="#f87171"/><circle cx="106" cy="80" r="6" fill="#fbbf24"/><circle cx="128" cy="80" r="6" fill="#4ade80"/><text x="80" y="146" fill="white" font-family="sans-serif" font-size="32" font-weight="600">GitOrbit</text><text x="80" y="180" fill="#a1a1aa" font-family="sans-serif" font-size="17">Your workspace, at a glance.</text>${[0,1,2,3].map((row)=>`<rect x="80" y="${210+row*64}" width="800" height="48" rx="10" fill="#222630"/><rect x="96" y="${225+row*64}" width="${160+row*35}" height="14" rx="7" fill="#737b8d"/><circle cx="840" cy="${234+row*64}" r="7" fill="${row===1?accent:'#4ade80'}"/>`).join('')}<rect x="80" y="488" width="128" height="12" rx="6" fill="${accent}"/></svg>`;
data.mediaImages=[sampleImage('#fbbf24'),sampleImage('#818cf8')];
function samplePdf() {
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>'];
  for(let index=0;index<2;index++) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 480 320] /Resources << /Font << /F1 7 0 R >> >> /Contents ${4+index*2} 0 R >>`);
    const text=`BT /F1 24 Tf 40 250 Td (GitOrbit - page ${index+1}) Tj /F1 14 Tf 0 -50 Td (Preview documentation without leaving your workspace.) Tj ET`;
    objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let output='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(output));output+=`${index+1} 0 obj\n${object}\nendobj\n`;});
  const xref=Buffer.byteLength(output);output+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return 'data:application/pdf;base64,'+Buffer.from(output).toString('base64');
}
data.mediaPdf=samplePdf();
await mkdir('.dev', { recursive: true })
await writeFile('.dev/readme-data.json', JSON.stringify(data, null, 2))
await writeFile('.dev/readme-preview.html', `<!doctype html>
<html lang="en" class="dark"><head><meta charset="utf-8"><title>GitOrbit · sample workspaces</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
const data = await (await fetch('/.dev/readme-data.json')).json();
const mediaDemo=new URLSearchParams(location.search).has('media');
const mediaPreviews={};
if(mediaDemo) {
  const pngs=await Promise.all(data.mediaImages.map(async svg=>{
    const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(svg);await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/png');
  }));
  const preview=(path,kind,mime,dataUrl,size=2048)=>({path,kind,mime,dataUrl,size,unavailable:null});
  mediaPreviews['assets/workspace-preview.png']={before:preview('assets/workspace-preview.png','image','image/png',pngs[0]),after:preview('assets/workspace-preview.png','image','image/png',pngs[1])};
  mediaPreviews['docs/getting-started.pdf']={before:null,after:preview('docs/getting-started.pdf','pdf','application/pdf',data.mediaPdf)};
  mediaPreviews['assets/orbit-mark.svg']={before:null,after:preview('assets/orbit-mark.svg','image','image/svg+xml','data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220"><circle cx="160" cy="110" r="65" fill="#171717" stroke="#fb923c" stroke-width="12"/><ellipse cx="160" cy="110" rx="145" ry="26" fill="none" stroke="#fbbf24" stroke-width="10" transform="rotate(-25 160 110)"/></svg>'))};
  mediaPreviews['backup/archive.zip']={before:null,after:{...preview('backup/archive.zip','binary','application/octet-stream',null,83240),unavailable:'No built-in preview for this file type.'}};
  Object.assign(data.snapshots.studio.repositories[0],{files:data.mediaFiles,changed:9,staged:1,unstaged:5,untracked:3});
  data.commitFiles=data.mediaFiles.map(file=>({...file,status:file.status==='??'?'A':'M'}));
}
if (new URLSearchParams(location.search).get('git') === 'missing') { data.environment.gitVersion = null; data.environment.gitPath = null; }
window.isTauri = true;
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
let roots = data.workspaces; let next = 0;
// Optional sign-in demo: only fixtures change, never credentials or Git refs.
const authDemo = new URLSearchParams(location.search).get('auth');
const syncDemo = new URLSearchParams(location.search).get('sync');
const sampleRepo = data.snapshots.studio.repositories.find(repo => repo.name === 'orbit/web');
let syncState = {reviewToken:'sample-context',head:data.outgoing.head,upstreamHead:'d1'.padEnd(40,'0'),sourceBranch:sampleRepo.branch,remote:'origin',destinationBranch:sampleRepo.branch,ahead:syncDemo==='behind'?0:2,behind:2,dirty:syncDemo==='dirty'?1:0,conflicts:syncDemo==='conflict'?1:0,operation:syncDemo==='conflict'?'merge':null,mergeHead:syncDemo==='conflict'?'d1'.padEnd(40,'0'):null,blockedReason:null,note:null,incoming:[{hash:'d1'.padEnd(40,'0'),subject:'fix: preserve remote workspace settings',author:'Demo',timestamp:1791102000},{hash:'d2'.padEnd(40,'0'),subject:'feat: improve repository refresh',author:'Demo',timestamp:1791098400}]};
if(syncDemo) Object.assign(sampleRepo,{ahead:syncState.ahead,behind:syncState.behind,changed:syncState.dirty,conflicts:syncState.conflicts});
let signedIn = false;
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
  if(command==='repository_compare') return {target:args.target,ahead:2,behind:1,diff:'diff --git a/src/workspace.ts b/src/workspace.ts\\n--- a/src/workspace.ts\\n+++ b/src/workspace.ts\\n@@ -1 +1 @@\\n-refresh(active)\\n+refreshAll(workspaces)\\n',truncated:false};
  if(command==='repository_outgoing') return data.outgoing;
  if(command==='repository_commit_options') return {reviewToken:'preview',head:data.history.head,previousMessage:'feat: keep workspaces up to date',canAmend:true,blockedReason:null,staged:1,published:false,signOffIdentity:'Demo Author <demo@example.invalid>',defaultAuthorName:'Demo Author',defaultAuthorEmail:'demo@example.invalid',previousAuthorName:'Demo Author',previousAuthorEmail:'demo@example.invalid',signingEnabled:false,signingKey:null,signingFormat:'openpgp'};
  if(command==='repository_submodules') return {reviewToken:'preview',modules:[{name:'shared',path:'packages/shared',url:'https://github.com/example/shared.git',status:'ready',expectedHead:'ac'.padEnd(40,'0'),head:'ac'.padEnd(40,'0'),dirty:false,blockedReason:null}],warnings:[]};
  if(command==='repository_revision_tree') return {revision:args.revision,directory:args.directory,entries:args.directory?[{name:'workspace.ts',path:args.directory+'/workspace.ts',kind:'file',hash:'ad'.padEnd(40,'0'),size:99}]:[{name:'src',path:'src',kind:'directory',hash:'ab'.padEnd(40,'0'),size:null},{name:'package.json',path:'package.json',kind:'file',hash:'ad'.padEnd(40,'0'),size:99}],truncated:false};
  if(command==='repository_revision_blob') return {revision:args.revision,path:args.file,text:'export function refreshWorkspace() {\\n  return Promise.all(workspaces.map(scan));\\n}\\n',binary:false,truncated:false,size:99,kind:'file'};
  if(command==='repository_tools') return {reviewToken:'preview',head:data.history.head,branch:'main',operation:null,changed:4,conflicts:0,refs:data.history.refs.map(ref=>({...ref,name:ref.kind==='branch'?'refs/heads/'+ref.name:ref.kind==='remote'?'refs/remotes/'+ref.name:'refs/tags/'+ref.name,kind:ref.kind==='branch'?'local':ref.kind,upstream:ref.kind==='branch'?'origin/main':'',current:ref.name==='main'})),stashes:[{id:'stash@{0}',hash:'ab'.padEnd(40,'0'),subject:'WIP: workspace settings'}],reflog:[{id:'HEAD@{0}',hash:data.history.head,subject:'commit: improve workspace refresh'}],remotes:['origin']};
  if(command==='repository_remotes') return {reviewToken:'preview',remotes:[{name:'origin',fetchUrls:['https://github.com/example/demo.git'],pushUrls:['https://github.com/example/demo.git'],pushUrlConfigured:false,hasCredentials:false,multipleUrls:false}]};
  if(command==='repository_tags') return {reviewToken:'preview',tags:[{name:'v0.1.0',objectId:'e1'.padEnd(40,'0'),commitId:'e1'.padEnd(40,'0'),annotated:false,subject:'Initial release'}],remotes:['origin']};
  if(command==='repository_ignored_files') return {files:['node_modules/.cache/sample','dist/index.html'],hasMore:false};
  if(command==='repository_delete_files_review') return {reviewToken:'preview',paths:args.paths};
  if(command==='repository_ignore_files_review') return {reviewToken:'preview',target:args.target,paths:args.paths,patterns:args.paths.map(path=>'/'+path)};
  if(command==='repository_interactive_rebase') return {reviewToken:'preview',head:data.history.head,base:'c1'.padEnd(40,'0'),commits:data.outgoing.commits.slice().reverse().map(commit=>({...commit,message:commit.subject})),blockedReason:null,published:false,shallow:false};
  if(command==='repository_file_history') return {commits:data.history.commits.slice(0,5).map(commit=>({...commit,path:args.file,previousPath:null,status:'M'})),hasMore:false,shallow:false};
  if(command==='repository_file_blame') return {revision:args.revision,lines:['export function refreshWorkspace() {','  return Promise.all(workspaces.map(scan));','}'].map((text,index)=>({hash:data.history.head,author:'Demo Author',timestamp:1791102000,originalLine:index+1,line:index+1,path:args.file,text})),truncated:false};
  if(command==='repository_partial_stage') return {reviewToken:'preview',hunks:['diff --git a/'+args.file+' b/'+args.file+'\\n--- a/'+args.file+'\\n+++ b/'+args.file+'\\n@@ -1,3 +1,3 @@\\n export function refreshWorkspace() {\\n-  return scan(activeWorkspace);\\n+  return Promise.all(workspaces.map(scan));\\n }'],unavailable:null};
  if(command==='repository_shelves') return {reviewToken:'preview',entries:[{id:'refs/gitorbit/shelves/sample',hash:'ab'.padEnd(40,'0'),title:'Workspace settings — draft',timestamp:1791102000}]};
  if(command==='repository_stash_preview'||command==='repository_shelf_preview') return {reviewToken:'preview',hash:args.stashHash||'ab'.padEnd(40,'0'),subject:command==='repository_shelf_preview'?'Workspace settings — draft':'WIP: workspace settings',baseRevision:data.history.head,indexRevision:'bc'.padEnd(40,'0'),untrackedRevision:null,files:data.commitFiles.map(file=>({...file,area:'working'}))};
  if(command==='repository_sync') {
    if(args.action==='integrate') {
      syncState={...syncState,head:'e1'.padEnd(40,'0'),ahead:3,behind:0,incoming:[]};
      data.outgoing={...data.outgoing,head:syncState.head,upstreamHead:syncState.upstreamHead,totalCommits:3,commits:[{hash:syncState.head,subject:'Merge incoming workspace updates',author:'Demo',timestamp:1791105600},...data.outgoing.commits]};
    }
    if(args.action==='abort') syncState={...syncState,operation:null,mergeHead:null,conflicts:0};
    Object.assign(sampleRepo,{ahead:syncState.ahead,behind:syncState.behind,conflicts:syncState.conflicts});
    return structuredClone(syncState);
  }
  if(command==='push_repository' && syncDemo) {Object.assign(sampleRepo,{ahead:0});return 'Documentation demo completed. No repository was changed.';}
  if(command==='push_repository' && authDemo) {
    if(!signedIn) throw new Error("remote: Failed to authenticate user\\nfatal: Authentication failed for 'https://git.example.invalid/demo/repo.git/'");
    return 'Documentation demo completed. No repository was changed.';
  }
  if(command==='repository_authentication') return {target:'https://git.example.invalid/demo/repo.git/',host:'https://git.example.invalid',canSignIn:authDemo!=='missing',reason:authDemo==='missing'?'Install and configure Git Credential Manager, then refresh this page.':null};
  if(command==='sign_in_repository') { signedIn=true; return null; }
  if(command==='cancel_git_sign_in' || command==='open_git_sign_in_setup') return null;
  if(command==='repository_commit_files' || command==='repository_history_commit_files') return data.commitFiles;
  if(['repository_commit_diff','repository_history_commit_diff','repository_file_history_diff','repository_stash_diff','repository_shelf_diff'].includes(command)) {
    if(mediaPreviews[args.file])return {beforeRevision:'b1'.padEnd(40,'0'),afterRevision:'a1'.padEnd(40,'0'),text:'',truncated:false,media:mediaPreviews[args.file]};
    const file = data.commitFiles.find(file => file.path === args.file) || {path:args.file,status:'M'};
    const text = file.status === 'A' ? 'diff --git a/'+args.file+' b/'+args.file+'\\nnew file mode 100644\\n--- /dev/null\\n+++ b/'+args.file+'\\n@@ -0,0 +1,3 @@\\n+export function WorkspaceTabs() {\\n+  return <nav aria-label="Workspaces" />;\\n+}' : file.originalPath ? 'diff --git a/'+file.originalPath+' b/'+file.path+'\\nsimilarity index 100%\\nrename from '+file.originalPath+'\\nrename to '+file.path : 'diff --git a/'+args.file+' b/'+args.file+'\\n--- a/'+args.file+'\\n+++ b/'+args.file+'\\n@@ -1,3 +1,4 @@\\n export function refreshWorkspace() {\\n-  return scan(activeWorkspace);\\n+  return Promise.all(workspaces.map(scan));\\n+  // Keep every workspace up to date.\\n }';
    return { beforeRevision: args.commitHash === data.outgoing.head ? 'b1'.padEnd(40, '0') : 'c1'.padEnd(40, '0'), afterRevision: args.commitHash||args.stashHash||'ab'.padEnd(40,'0'), text, truncated: false };
  }
  if(command==='repository_changes') return data.snapshots.studio.repositories[0];
  if(command==='repository_diff'&&mediaPreviews[args.file])return {text:'',truncated:false,media:mediaPreviews[args.file]};
  if(command==='repository_diff') return { text: 'diff --git a/'+args.file+' b/'+args.file+'\\n--- a/'+args.file+'\\n+++ b/'+args.file+'\\n@@ -1,4 +1,5 @@\\n export function refreshWorkspace() {\\n-  return scan(activeWorkspace);\\n+  return Promise.all(workspaces.map(scan));\\n+  // Keep every workspace up to date.\\n }', truncated: false };
  if(command==='save_workspaces') {roots=args.workspaces; return null;}
  if(command==='plugin:event|listen') return ++next;
  if(command==='plugin:event|unlisten') return null;
  if(command==='plugin:dialog|open' || command==='plugin:dialog|save') return null;
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
