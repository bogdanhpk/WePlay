'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = path.resolve(process.env.WEPLAY_APP_SOURCE || path.join(__dirname, '../app'));
const context = {WEPLAY_SETTINGS: {tmdbReadToken: ''}, localStorage: {getItem: () => null}};
context.window = context;
vm.createContext(context);
for (const name of ['catalog-union', 'catalog-web', 'tmdb-index', 'tmdb']) {
  vm.runInContext(fs.readFileSync(path.join(source, name + '.js'), 'utf8'), context);
}
const item = (title, year, kind = 'movie', ids = {}) => ({id: 'qa', title, _kind: kind, xfields: {year: String(year), ...ids}});
const lookup = value => Array.from(context.WePlayTMDB.indexedPreviews(value));
for (const [title, year, frame] of [
  ['Руки Вверх! 2', 2026, '/dRYeSMvmzLPmQdftvaNcnpBwBBJ.jpg'],
  ['Цикл зверя', 2026, '/bgHW6AJl2SdKzxglvf9tshXbI84.jpg'],
  ['Маме снова 17', 2024, '/czqKvbsNqeQohU6pZhBpTHMkXYt.jpg']
]) {
  assert.ok(lookup(item(title, year)).some(url => url.endsWith(frame)), title);
  assert.equal(lookup(item(title, 1990)).length, 0, 'No cover from another release year');
  assert.equal(lookup(item(title, year, 'series')).length, 0, 'No film cover used for a series');
  assert.equal(lookup(item(title, year, 'movie', {tmdb_id: '999999999'})).length, 0, 'Conflicting IDs rejected');
}
assert.deepEqual(lookup(item('РУКИ ВВЕРХ! 2', 2026)), lookup(item('Руки вверх 2', 2026)));
assert.equal(lookup(item('Цикл зверя', '')).length, 0, 'Title alone is not enough without a year or ID');
assert.ok(lookup(item('Alternate localized name', 2026, 'movie', {tmdb_id: '1290418'})).length);
const original = context.WEPLAY_TMDB_INDEX.previews;
const sample = original.find(row => row.tmdbId === '1290418');
context.WEPLAY_TMDB_INDEX.previews = [sample, {...sample, ids: {tmdb: '999999998'}, tmdbId: '999999998'}];
assert.equal(lookup(item('Цикл зверя', 2026)).length, 0, 'Ambiguous title/year rejected');
assert.ok(lookup(item('Цикл зверя', 2026, 'movie', {tmdb_id: '1290418'})).length);
context.WEPLAY_TMDB_INDEX.previews = original;
const start = performance.now();
for (const row of original) {
  const urls = lookup(item(row.names[0], row.year, row.kind, {tmdb_id: row.tmdbId}));
  assert.ok(urls.length, row.kind + ':' + row.tmdbId);
  assert.ok(urls.every(url => /^https:\/\/image\.tmdb\.org\/t\/p\/original\/[a-zA-Z0-9]+\.(jpg|png|webp)$/.test(url)));
}
console.log(JSON.stringify({result: 'PASS',covers: original.length,lookupMs: Math.round(performance.now() - start),checks: ['keyless Russian and localized titles', 'wrong year/type/ID rejected', 'ambiguous matches rejected', 'all preview records resolve by verified ID']}));
