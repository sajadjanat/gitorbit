import fs from 'node:fs';

// Keep a release in draft until every supported OS can receive its signed update.
const version = process.argv.find(arg => /^\d+\.\d+\.\d+$/.test(arg))
  ?? JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version;
const dryRun = process.argv.includes('--dry-run');
const assemble = process.argv.includes('--assemble');
if (assemble && dryRun) throw new Error('--assemble cannot be combined with --dry-run.');
const repository = process.env.GITHUB_REPOSITORY ?? 'sajadjanat/gitorbit';
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is required to inspect draft release assets.');
const api = `https://api.github.com/repos/${repository}`;

async function request(url, {binary = false, method = 'GET', body, raw = false} = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? {'Content-Type': raw ? 'application/octet-stream' : 'application/json'} : {}),
    },
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${url}`);
  if (response.status === 204) return undefined;
  return binary ? response.text() : response.json();
}

// The tag lookup can return 404 for an unpublished draft. The authenticated
// releases list includes drafts and works before and after publication.
const releases = await request(`${api}/releases?per_page=100`);
const release = releases.find(item => item.tag_name === `v${version}`);
if (!release) throw new Error(`Release v${version} was not found.`);
const assets = await request(`${api}/releases/${release.id}/assets?per_page=100`);
let manifestAsset = assets.find(asset => asset.name === 'latest.json');
let manifest;
if (assemble) {
  if (!release.draft) throw new Error('Only an unpublished draft can be assembled.');
  const platforms = {};
  const groups = [
    [/_x64-setup\.exe$/, ['windows-x86_64', 'windows-x86_64-nsis']],
    [/universal.*\.app\.tar\.gz$/, ['darwin-aarch64', 'darwin-x86_64', 'darwin-aarch64-app', 'darwin-x86_64-app']],
    [/_amd64\.AppImage$/, ['linux-x86_64', 'linux-x86_64-appimage']],
    [/_amd64\.deb$/, ['linux-x86_64-deb']],
  ];
  for (const [pattern, names] of groups) {
    const matches = assets.filter(asset => pattern.test(asset.name));
    if (matches.length !== 1 || !matches[0].size) throw new Error(`Expected one package matching ${pattern}.`);
    const asset = matches[0];
    const signatureAsset = assets.find(item => item.name === `${asset.name}.sig`);
    if (!signatureAsset?.size) throw new Error(`Missing signature for ${asset.name}.`);
    const signature = (await request(signatureAsset.url, {binary: true})).trim();
    if (!signature) throw new Error(`Empty signature for ${asset.name}.`);
    const entry = {signature, url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(asset.name)}`};
    for (const name of names) platforms[name] = entry;
  }
  manifest = {
    version,
    notes: fs.readFileSync(new URL(`../docs/releases/${version}.md`, import.meta.url), 'utf8'),
    pub_date: new Date().toISOString(),
    platforms,
  };
} else {
  if (!manifestAsset) throw new Error('latest.json is missing.');
  manifest = JSON.parse(await request(manifestAsset.url, {binary: true}));
}
if (manifest.version !== version) throw new Error('Update manifest version does not match the release.');

const required = ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64'];
if (assemble) required.push('windows-x86_64-nsis', 'darwin-aarch64-app', 'darwin-x86_64-app', 'linux-x86_64-appimage', 'linux-x86_64-deb');
for (const platform of required) {
  const entry = manifest.platforms?.[platform];
  if (!entry?.signature || !entry.url) throw new Error(`Signed updater entry missing: ${platform}`);
  const url = new URL(entry.url);
  if (url.origin !== 'https://github.com' || !url.pathname.startsWith(`/${repository}/releases/download/v${version}/`)) {
    throw new Error(`Update asset points outside this release: ${platform}`);
  }
  const name = decodeURIComponent(url.pathname.split('/').at(-1));
  const packageAsset = assets.find(asset => asset.name === name);
  const signatureAsset = assets.find(asset => asset.name === `${name}.sig`);
  if (!packageAsset?.size || !signatureAsset?.size) throw new Error(`Package/signature assets missing: ${platform}`);
  const signature = (await request(signatureAsset.url, {binary: true})).trim();
  if (signature !== entry.signature.trim()) throw new Error(`Manifest signature differs from package signature: ${platform}`);
  console.log(`Verified ${platform}: ${name}`);
}

if (!dryRun) {
  if (assemble) {
    // Replace only this draft's reproducible manifest after validating every entry.
    if (manifestAsset) await request(manifestAsset.url, {method: 'DELETE'});
    const upload = new URL(release.upload_url.split('{')[0]);
    upload.searchParams.set('name', 'latest.json');
    manifestAsset = await request(upload.href, {method: 'POST', raw: true, body: JSON.stringify(manifest, null, 2)});
    const uploaded = JSON.parse(await request(manifestAsset.url, {binary: true}));
    if (JSON.stringify(uploaded) !== JSON.stringify(manifest)) throw new Error('Uploaded manifest differs from verified contents.');
  }
  await request(`${api}/releases/${release.id}`, {method: 'PATCH', body: {tag_name: `v${version}`, draft: false, make_latest: 'true'}});
  console.log(`Published GitOrbit ${version}: https://github.com/${repository}/releases/tag/v${version}`);
} else {
  console.log(`Dry run passed for ${release.html_url}; no release changes made.`);
}
