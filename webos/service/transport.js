'use strict';
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const dns = require('dns');
const URL = require('url').URL;
const cookies = new Map();
const catalogHost = /^(?:lord\.kim|(?:sb|sn)\.lordfilm5\.pro|lordfilms\.pub|lordfilm\.vc|lordfilm26-kino\d+\.lat)$/;
const responseHeaders = ['content-type', 'content-length', 'content-encoding', 'content-range', 'accept-ranges', 'date', 'age'];

function publicAddress(address) {
  const bytes = address.split('.').map(Number);
  const [first, second, third] = bytes;
  return bytes.length === 4 && first > 0 && first < 224 && first !== 10 && first !== 127
    && !(first === 100 && second >= 64 && second <= 127)
    && !(first === 169 && second === 254)
    && !(first === 172 && second >= 16 && second <= 31)
    && !(first === 192 && (second === 168 || (second === 0 && (third === 0 || third === 2))))
    && !(first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100)))
    && !(first === 203 && second === 0 && third === 113);
}

function lookup(host, options, callback) {
  dns.lookup(host, {family: 4}, function (error, address) {
    if (error) callback(error);
    else if (!publicAddress(address)) callback(new Error('Public network required'));
    else if (options.all) callback(null, [{address: address, family: 4}]);
    else callback(null, address, 4);
  });
}

function rememberCookies(target, entries) {
  const host = target.hostname;
  const jar = cookies.get(host) || new Map();
  entries.forEach(function (entry) {
    const fields = entry.split(';');
    const pair = fields.shift().trim();
    const delimiter = pair.indexOf('=');
    if (delimiter < 1 || pair.length > 2048) return;
    const name = pair.slice(0, delimiter);
    const pathField = fields.find(field => /^\s*path\s*=/i.test(field));
    const pathValue = pathField ? pathField.slice(pathField.indexOf('=') + 1).trim() : '';
    const path = pathValue.charAt(0) === '/' ? pathValue : target.pathname.slice(0, target.pathname.lastIndexOf('/')) || '/';
    const key = name + '\n' + path;
    const age = fields.find(field => /^\s*max-age\s*=/i.test(field));
    const expiry = fields.find(field => /^\s*expires\s*=/i.test(field));
    const expiresAt = age ? Date.now() + Number(age.split('=')[1]) * 1000 : expiry ? Date.parse(expiry.split('=')[1]) : Infinity;
    if (expiresAt <= Date.now()) jar.delete(key);
    else jar.set(key, {pair: pair, path: path, expiresAt: isNaN(expiresAt) ? Infinity : expiresAt});
  });
  while (jar.size > 12) jar.delete(jar.keys().next().value);
  cookies.delete(host);
  cookies.set(host, jar);
  while (cookies.size > 20) cookies.delete(cookies.keys().next().value);
}

function searchPayload(target, raw) {
  if (raw == null) return null;
  if (!/^lordfilm26-kino\d+\.lat$/.test(target.hostname) || target.pathname !== '/engine/ajax/controller.php'
    || target.search !== '?mod=media_catalog' || raw.length > 1024) throw new Error('Invalid catalog search');
  const fields = JSON.parse(raw);
  if (typeof fields.query !== 'string' || !fields.query.trim() || fields.query.length > 160
    || typeof fields.csrf !== 'string' || !/^[a-f0-9]{32,128}$/i.test(fields.csrf)) throw new Error('Invalid catalog search');
  return Buffer.from('action=search&query=' + encodeURIComponent(fields.query) + '&csrf=' + encodeURIComponent(fields.csrf));
}

function forward(raw, request, reply, withCookies, redirects, retried, search) {
  if (reply.destroyed || reply.finished) return;
  let target;
  try { target = new URL(raw); } catch (ignore) {}
  // Hostnames only, so even IP literals that bypass the DNS callback are refused.
  if (!target || target.protocol !== 'https:' || target.username || target.password || target.port
    || !/^(?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*$/i.test(target.hostname) || redirects > 8) {
    reply.writeHead(400).end();
    return;
  }

  let body;
  try { body = searchPayload(target, search); } catch (ignore) { reply.writeHead(400).end(); return; }

  const headers = {'User-Agent': 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36', 'Accept-Encoding': 'identity'};
  ['range', 'accept'].forEach(function (name) {
    if (request.headers[name]) headers[name] = request.headers[name];
  });
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
    headers['Content-Length'] = body.length;
    headers.Referer = target.origin + '/';
  }
  const useCookies = withCookies && catalogHost.test(target.hostname);
  if (useCookies && cookies.has(target.hostname)) {
    const active = Array.from(cookies.get(target.hostname).values()).filter(cookie => cookie.expiresAt > Date.now()
      && (target.pathname === cookie.path || target.pathname.indexOf(cookie.path + (cookie.path.endsWith('/') ? '' : '/')) === 0));
    active.sort((a, b) => b.path.length - a.path.length);
    if (active.length) headers.Cookie = active.map(cookie => cookie.pair).join('; ');
  }
  let handedOff = false;
  const upstream = https.request({
    hostname: target.hostname, path: target.pathname + target.search, method: body ? 'POST' : request.method,
    headers: headers, lookup: lookup, agent: false
  }, function (response) {
    if (useCookies && response.headers['set-cookie']) rememberCookies(target, response.headers['set-cookie']);
    if ([301, 302, 303, 307, 308].indexOf(response.statusCode) >= 0 && response.headers.location) {
      let next;
      try { next = new URL(response.headers.location, target).href; } catch (ignore) {}
      handedOff = true;
      response.destroy();
      forward(next, request, reply, withCookies, redirects + 1, retried, search);
      return;
    }
    responseHeaders.forEach(function (name) {
      if (response.headers[name] !== undefined) reply.setHeader(name, response.headers[name]);
    });
    reply.setHeader('X-WePlay-Final-URL', target.href);
    reply.writeHead(response.statusCode);
    response.on('error', function () { reply.destroy(); });
    response.pipe(reply);
  });

  function closeUpstream() { upstream.destroy(); }
  reply.once('close', closeUpstream);
  upstream.once('close', function () { reply.removeListener('close', closeUpstream); });
  upstream.setTimeout(body ? 30000 : 12000, closeUpstream);
  upstream.on('error', function (error) {
    if (handedOff || reply.destroyed || reply.finished) return;
    if (!reply.headersSent && !retried && ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN'].indexOf(error.code) >= 0) {
      forward(raw, request, reply, withCookies, redirects, true, search);
      return;
    }
    if (reply.headersSent) reply.destroy();
    else reply.writeHead(502).end();
  });
  upstream.end(body || undefined);
}

module.exports = function createTransport() {
  return new Promise(function (resolve, reject) {
    const capability = '/' + crypto.randomBytes(24).toString('hex') + '/';
    const server = http.createServer(function (request, reply) {
      let url;
      try { url = new URL(request.url, 'http://127.0.0.1'); } catch (ignore) {}
      if (!url || url.origin !== 'http://127.0.0.1' || url.pathname !== capability) {
        reply.writeHead(404).end();
        return;
      }
      // Packaged apps have an opaque file origin. Every request still needs the
      // randomly generated capability, disclosed only to our Luna subscriber.
      reply.setHeader('Access-Control-Allow-Origin', '*');
      reply.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      reply.setHeader('Access-Control-Allow-Headers', 'Range, Accept');
      reply.setHeader('Access-Control-Allow-Private-Network', 'true');
      reply.setHeader('Access-Control-Expose-Headers', 'X-WePlay-Final-URL, Content-Range, Accept-Ranges, Date, Age');
      reply.setHeader('Cache-Control', 'no-store');
      if (request.method === 'OPTIONS') reply.writeHead(204).end();
      else if (request.method === 'GET' || request.method === 'HEAD') {
        const search = url.searchParams.get('catalogSearch');
        if (search != null && request.method !== 'GET') reply.writeHead(405).end();
        else forward(url.searchParams.get('url'), request, reply, url.searchParams.get('session') === '1', 0, false, search);
      } else reply.writeHead(405).end();
    });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', function () {
      server.unref();
      resolve('http://127.0.0.1:' + server.address().port + capability);
    });
  });
};
