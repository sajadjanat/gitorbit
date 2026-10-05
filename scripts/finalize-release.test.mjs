import assert from 'node:assert/strict';
import test from 'node:test';

async function runFixture({missing, corruptedUpload = false, dryRun = false} = {}) {
  const originalFetch = globalThis.fetch;
  const originalArgs = process.argv;
  const originalToken = process.env.GITHUB_TOKEN;
  const originalRepository = process.env.GITHUB_REPOSITORY;
  const calls = [];
  let uploaded;
  const api = 'https://api.github.com/repos/sajadjanat/gitorbit';
  const release = {id: 1, tag_name: 'v0.4.0', draft: true, upload_url: 'https://uploads.github.com/release/1{?name}', html_url: 'draft'};
  const names = ['GitOrbit_0.4.0_x64-setup.exe', 'GitOrbit_universal.app.tar.gz', 'GitOrbit_0.4.0_amd64.AppImage', 'GitOrbit_0.4.0_amd64.deb'];
  const assets = names.flatMap((name, i) => [
    {name, size: 100, url: `${api}/assets/${i}`},
    {name: `${name}.sig`, size: 30, url: `${api}/signatures/${i}`},
  ]).filter(asset => asset.name !== missing);
  assets.push({name: 'latest.json', size: 100, url: `${api}/manifest`});
  const previousManifest = {version: '0.4.0', platforms: Object.fromEntries([
    ['windows-x86_64', 0], ['darwin-aarch64', 1], ['darwin-x86_64', 1], ['linux-x86_64', 2],
  ].map(([platform, i]) => [platform, {url: `https://github.com/sajadjanat/gitorbit/releases/download/v0.4.0/${names[i]}`, signature: `signature-${i}`}]))};
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    calls.push({url: String(url), method, body: options.body});
    if (String(url).endsWith('/releases?per_page=100')) return Response.json([release]);
    if (String(url).endsWith('/assets?per_page=100')) return Response.json(assets);
    if (String(url).includes('/signatures/')) return new Response(`signature-${String(url).split('/').at(-1)}\n`);
    if (String(url).endsWith('/manifest') && method === 'GET') return Response.json(previousManifest);
    if (method === 'DELETE') return new Response(null, {status: 204});
    if (String(url).startsWith('https://uploads.github.com/')) {
      uploaded = JSON.parse(options.body);
      return Response.json({url: `${api}/uploaded-manifest`});
    }
    if (String(url).endsWith('/uploaded-manifest')) return Response.json(corruptedUpload ? {version: 'wrong'} : uploaded);
    if (method === 'PATCH') return Response.json({draft: false});
    throw new Error(`Unexpected fixture request: ${method} ${url}`);
  };
  process.argv = ['node', 'finalize-release.mjs', '0.4.0', dryRun ? '--dry-run' : '--assemble'];
  process.env.GITHUB_TOKEN = 'test-fixture-token';
  process.env.GITHUB_REPOSITORY = 'sajadjanat/gitorbit';
  let error;
  try { await import(`./finalize-release.mjs?fixture=${Date.now()}-${Math.random()}`); }
  catch (caught) { error = caught; }
  finally {
    globalThis.fetch = originalFetch;
    process.argv = originalArgs;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = originalToken;
    if (originalRepository === undefined) delete process.env.GITHUB_REPOSITORY; else process.env.GITHUB_REPOSITORY = originalRepository;
  }
  return {calls, uploaded, error};
}

test('publishes only after all nine updater entries and uploaded manifest are verified', async () => {
  const result = await runFixture();
  assert.ifError(result.error);
  assert.equal(Object.keys(result.uploaded.platforms).length, 9);
  assert.equal(result.calls.at(-1).method, 'PATCH');
  assert.equal(JSON.parse(result.calls.at(-1).body).draft, false);
});
for (const missing of ['GitOrbit_0.4.0_amd64.deb', 'GitOrbit_universal.app.tar.gz.sig']) {
  test(`incomplete draft stays unpublished: ${missing}`, async () => {
    const result = await runFixture({missing});
    assert.ok(result.error);
    assert.ok(result.calls.every(call => call.method === 'GET'));
  });
}
test('a corrupted uploaded manifest leaves the release in draft', async () => {
  const result = await runFixture({corruptedUpload: true});
  assert.match(result.error.message, /differs/);
  assert.ok(result.calls.every(call => call.method !== 'PATCH'));
});
test('dry run validates existing manifest without changing assets or publication', async () => {
  const result = await runFixture({dryRun: true});
  assert.ifError(result.error);
  assert.ok(result.calls.every(call => call.method === 'GET'));
});
