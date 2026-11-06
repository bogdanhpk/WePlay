#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {createHash} = require('node:crypto');

const root = __dirname;
const platform = path.join(root, 'platform');
const source = path.resolve(process.argv[2] || path.join(root, '../app'));
const dest = path.resolve(process.argv[3] || path.join(root, 'dist'));
const metadata = require('./platform/appinfo.json');
const updateSource = fs.readFileSync(path.join(platform, 'update-config.js'), 'utf8');
const update = JSON.parse(updateSource.slice(updateSource.indexOf('{'), updateSource.lastIndexOf('}') + 1));
if (metadata.id !== update.app || metadata.version !== update.bundledVersion) {
  throw new Error('The webOS installer ID and version must match its OTA configuration');
}
const stage = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'weplay-webos-'));

function replaceRequired(text, before, after) {
  if (!text.includes(before)) throw new Error('Review the webOS adapter: missing ' + before);
  return text.replace(before, after);
}

try {
  const app = path.join(stage, 'app');
  fs.mkdirSync(app);
  let html = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
  html = replaceRequired(html, 'width=1920, initial-scale=1', 'width=device-width, initial-scale=1');
  html = replaceRequired(html, 'Samsung Tizen', 'LG webOS');
  html = replaceRequired(html, 'weplay-icon.png', 'large-icon.png');
  html = replaceRequired(html, '  <script src="$WEBAPIS/webapis/webapis.js"></script>\n', '');
  html = replaceRequired(html, '<script src="settings.js"></script>', [
    '  <script src="vendor/webOSTV.js"></script>',
    '  <script src="webos.js"></script>',
    '<script src="settings.js"></script>'
  ].join('\n'));

  // Copy only the shared runtime and assets, never the Samsung shell or personal settings.
  for (const dir of ['assets', 'fonts', 'vendor']) {
    fs.cpSync(path.join(source, dir), path.join(app, dir), {recursive: true});
  }
  const [, bundled] = html.match(/WEPLAY_BUNDLED_SCRIPTS=(\[[^\]]*\]);/) || [];
  if (!bundled) throw new Error('Missing bundled interface entrypoints');
  const scripts = JSON.parse(bundled);
  const files = new Set([...scripts, ...Array.from(html.matchAll(/(?:src|href)="([a-z-]+\.(?:js|css))"/g), match => match[1])]);
  for (const file of ['settings.js', 'webos.js', 'update-config.js']) files.delete(file);
  for (const file of files) fs.copyFileSync(path.join(source, file), path.join(app, file));
  fs.cpSync(platform, app, {recursive: true});

  fs.writeFileSync(path.join(app, 'settings.js'), "window.WEPLAY_SETTINGS = { apiToken: '', tmdbReadToken: '' };\n");
  fs.writeFileSync(path.join(app, 'index.html'), html);

  fs.mkdirSync(dest, {recursive: true});
  const packager = process.env.WEPLAY_ARES_PACKAGE || 'ares-package';
  execFileSync(packager, ['-o', dest, app, path.join(root, 'service')], {stdio: 'inherit'});
  const name = metadata.id + '_' + metadata.version + '_all.ipk';
  const checksum = createHash('sha256').update(fs.readFileSync(path.join(dest, name))).digest('hex');
  fs.writeFileSync(path.join(dest, name + '.sha256'), checksum + '  ' + name + '\n');
} finally {
  fs.rmSync(stage, {recursive: true, force: true});
}
