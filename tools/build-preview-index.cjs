/* Publish only public TMDB backdrop paths. The API credential stays on the builder. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const at = args.indexOf(name);
    return at < 0 ? fallback : args[at + 1];
  };
  const tokenFile = option('--token-file');
  if (!tokenFile) throw Error('Pass --token-file with a local readToken; never commit that file.');
  const credentials = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
  const token = String(credentials.readToken || '').trim();
  if (!token) throw Error('Missing readToken');
  const app = path.resolve(option('--source', path.join(__dirname, '../app')));
  const output = path.resolve(option('--out', path.join(app, 'tmdb-index.js')));
  const context = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(app, 'tmdb-index.js'), 'utf8'), context);
  const index = context.window.WEPLAY_TMDB_INDEX;
  const previousCount = (index.previews || []).length;
  const runtime = {window: {}};
  vm.runInNewContext(fs.readFileSync(path.join(app, 'catalog-union.js'), 'utf8'), runtime);
  const normal = runtime.window.WePlayCatalogUnion.normal;
  const rows = new Map();
  for (const row of index.previews || []) rows.set(row.kind + ':' + row.tmdbId, row);
  const year = new Date().getUTCFullYear();
  const recent = {'primary_release_date.gte': (year - 1) + '-01-01', 'primary_release_date.lte': year + '-12-31'};
  const groups = [
    {type: 'movie', pages: 60, params: {with_origin_country: 'RU|SU'}},
    {type: 'movie', pages: 20, params: {with_origin_country: 'RU|SU', ...recent}},
    {type: 'tv', pages: 25, params: {with_origin_country: 'RU|SU'}},
    {type: 'movie', pages: 50, params: recent},
    {type: 'tv', pages: 25, params: {'first_air_date.gte': (year - 1) + '-01-01', 'first_air_date.lte': year + '-12-31'}},
    {type: 'movie', pages: 30, params: {}}
  ];
  let requests = 0, received = 0;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function request(route, params = {}) {
    const url = new URL('https://api.themoviedb.org/3/' + route);
    for (const [key, value] of Object.entries({language: 'ru-RU', ...params})) url.searchParams.set(key, value);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        requests++;
        const response = await fetch(url, {headers: {Authorization: 'Bearer ' + token, Accept: 'application/json'}, signal: AbortSignal.timeout(12000)});
        if (response.status === 401 || response.status === 403) throw Error('TMDB authorization failed');
        if (!response.ok) throw Error('TMDB HTTP ' + response.status);
        return await response.json();
      } catch (error) {
        if (/authorization/.test(error.message) || attempt === 2) throw error;
        await pause(300 * (attempt + 1));
      }
    }
  }
  function add(record, type) {
    received++;
    const date = type === 'tv' ? record.first_air_date : record.release_date;
    const frame = record.backdrop_path;
    if (record.adult || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\/[a-zA-Z0-9]+\.(?:jpg|png|webp)$/.test(frame || '')) return;
    const id = String(record.id), kind = type === 'tv' ? 'series' : 'movie';
    if (!/^[1-9]\d*$/.test(id)) return;
    const names = [...new Set([record.title, record.name, record.original_title, record.original_name].map(normal).filter(Boolean))];
    if (!names.length) return;
    const key = kind + ':' + id, old = rows.get(key);
    const row = {kind, year: date.slice(0, 4), names, ids: {tmdb: id}, tmdbId: id, frames: [frame]};
    if (old && old.year === row.year) {
      row.names = [...new Set([...old.names, ...names])];
      row.ids = {...old.ids, ...row.ids};
      row.frames = [...new Set([...old.frames, frame])].slice(0, 4);
    }
    rows.set(key, row);
  }
  // Bound concurrency: the builder is not a runtime request fan-out on the TV.
  const tasks = groups.flatMap(group => Array.from({length: group.pages}, (_, page) => ({...group, page: page + 1})));
  let next = 0;
  async function worker() {
    for (let job; (job = tasks[next++]);) {
      const data = await request('discover/' + job.type, {include_adult: false, sort_by: 'popularity.desc', ...job.params, page: job.page});
      for (const record of data.results || []) add(record, job.type);
    }
  }
  await Promise.all(Array.from({length: 3}, worker));
  for (let at = 0; at < args.length; at++) {
    if (args[at] !== '--include') continue;
    const match = /^(movie|tv):([1-9]\d*)$/.exec(args[++at] || '');
    if (!match) throw Error('Expected --include movie:123 or tv:123');
    add(await request(match[1] + '/' + match[2]), match[1]);
  }
  index.previews = [...rows.values()].sort((a, b) => a.kind.localeCompare(b.kind) || Number(a.tmdbId) - Number(b.tmdbId));
  index.previewsUpdatedAt = new Date().toISOString();
  const source = 'window.WEPLAY_TMDB_INDEX = ' + JSON.stringify(index) + ';\n';
  if (source.includes(token)) throw Error('Refusing to write credential to public output');
  if (index.previews.length < previousCount) throw Error('Preview index shrank unexpectedly');
  fs.writeFileSync(output, source);
  console.log(JSON.stringify({previews: rows.size, received, requests, bytes: Buffer.byteLength(source)}));
}
main().catch(error => {console.error(error.message); process.exitCode = 1;});
