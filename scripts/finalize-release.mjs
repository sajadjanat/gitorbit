import fs from 'node:fs';

// Keep a release in draft until every supported OS can receive its signed update.
const version = process.argv.find(arg => /^\d+\.\d+\.\d+$/.test(arg))
  ?? JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version;
const dryRun = process.argv.includes('--dry-run');
const repository = process.env.GITHUB_REPOSITORY ?? 'sajadjanat/gitorbit';
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is required to inspect draft release assets.');
const api = `https://api.github.com/repos/${repository}`;

async function request(url, {binary = false, method = 'GET', body} = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? {'Content-Type': 'application/json'} : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`GitHub request failed: ${response.status} ${url}`);
  return binary ? response.text() : response.json();
}

const release = await request(`${api}/releases/tags/v${version}`);
const assets = await request(`${api}/releases/${release.id}/assets?per_page=100`);
const manifestAsset = assets.find(asset => asset.name === 'latest.json');
if (!manifestAsset) throw new Error('latest.json is missing.');
const manifest = JSON.parse(await request(manifestAsset.url, {binary: true}));
if (manifest.version !== version) throw new Error('Update manifest version does not match the release.');

for (const platform of ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64', 'linux-x86_64']) {
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
  await request(`${api}/releases/${release.id}`, {method: 'PATCH', body: {draft: false, make_latest: 'true'}});
  console.log(`Published GitOrbit ${version}: ${release.html_url}`);
} else {
  console.log(`Dry run passed for ${release.html_url}; no release changes made.`);
}
