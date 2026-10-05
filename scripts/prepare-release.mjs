import fs from 'node:fs';

const version = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version;
const repository = process.env.GITHUB_REPOSITORY;
if (!repository || !process.env.GITHUB_TOKEN) throw new Error('GitHub release environment is required.');
const api = `https://api.github.com/repos/${repository}`;
async function request(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    headers: {Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json'},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`GitHub release preparation failed: ${response.status}`);
  return response.json();
}
const releases = await request(`${api}/releases?per_page=100`);
const existing = releases.find(release => release.tag_name === `v${version}`);
if (existing && !existing.draft) throw new Error('This version has already been published.');
const body = {
  tag_name: `v${version}`, target_commitish: process.env.GITHUB_SHA,
  name: `GitOrbit ${version}`, draft: true,
  body: fs.readFileSync(new URL(`../docs/releases/${version}.md`, import.meta.url), 'utf8'),
};
const release = await request(existing ? `${api}/releases/${existing.id}` : `${api}/releases`, existing ? 'PATCH' : 'POST', body);
fs.appendFileSync(process.env.GITHUB_OUTPUT, `release_id=${release.id}\n`);
console.log(`Prepared draft GitOrbit ${version}.`);
