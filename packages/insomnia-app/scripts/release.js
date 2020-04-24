const { appConfig } = require('../config');
const glob = require('fast-glob');
const fs = require('fs');
const path = require('path');
const packageTask = require('./package');
const buildTask = require('./build');
const Octokit = require('@octokit/rest');

// Configure Octokit
const octokit = new Octokit({
  auth: process.env.GH_TOKEN,
});

// Start package if ran from CLI
if (require.main === module) {
  process.nextTick(async () => {
    try {
      const buildContext = await buildTask.start();
      await packageTask.start();
      await start(buildContext.app, buildContext.version);
    } catch (err) {
      console.log('[package] ERROR:', err);
      process.exit(1);
    }
  });
}

async function start(app, version) {
  console.log(`[release] Creating release for ${app} ${version}`);

  const assetGlobs = {
    darwin: ['dist/**/*.zip', 'dist/**/*.dmg'],
    win32: ['dist/squirrel-windows/*'],
    linux: [
      'dist/**/*.snap',
      'dist/**/*.rpm',
      'dist/**/*.deb',
      'dist/**/*.AppImage',
      'dist/**/*.tar.gz',
    ],
  };

  const paths = await glob(assetGlobs[process.platform]);

  const { data } = await getOrCreateRelease(app, version);

  for (const p of paths) {
    let name = path.basename(p);

    // This file would conflict between Core/Designer so we'll prefix it with the app ID
    if (name === 'RELEASES') {
      name = `${appConfig().appId}.RELEASES`;
    }

    console.log(`[release] Uploading ${p}`);
    await octokit.request({
      method: 'POST',
      url: 'https://uploads.github.com/repos/:owner/:repo/releases/:id/assets{?name,label}"',
      id: data.id,
      name: name,
      owner: appConfig().githubOrg,
      repo: appConfig().githubRepo,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      data: fs.readFileSync(p),
    });
  }

  console.log(`[release] Release created ${data.url}`);
}

async function getOrCreateRelease(app, version) {
  const tag = `${app}@${version}`;
  const releaseName = `${app.slice(0, 1).toUpperCase()}${app.slice(1)} ${version} 📦`;

  try {
    return await octokit.repos.getReleaseByTag({
      owner: appConfig().githubOrg,
      repo: appConfig().githubRepo,
      tag,
    });
  } catch (err) {
    // Doesn't exist
  }

  return octokit.repos.createRelease({
    owner: appConfig().githubOrg,
    repo: appConfig().githubRepo,
    tag_name: tag,
    name: releaseName,
    body: `Full changelog ⇒ https://insomnia.rest/changelog/${tag}`,
    draft: false,
    preRelease: true,
  });
}
