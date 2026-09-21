'use strict';

const SHELL_CACHE = 'parque-shell-v5';
const OFFLINE_CACHE = 'parque-offline-v5';
const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    for (const asset of SHELL_ASSETS) {
      try {
        const response = await fetch(asset, { cache: 'reload' });
        if (response.ok) await cache.put(asset, response);
      } catch (_) {}
    }
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, OFFLINE_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => !keep.has(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

function withoutRange(request) {
  const headers = new Headers(request.headers);
  headers.delete('range');
  return new Request(request.url, {
    method: 'GET',
    headers,
    mode: request.mode,
    credentials: request.credentials,
    cache: 'no-store',
    redirect: request.redirect
  });
}

async function findFullResponse(request) {
  // Cache API normaliza URLs absolutas, por eso probamos con la URL exacta.
  let response = await caches.match(request.url, { ignoreSearch: false, ignoreVary: true });
  if (response) return response;

  const noRange = withoutRange(request);
  response = await caches.match(noRange, { ignoreSearch: false, ignoreVary: true });
  if (response) return response;

  try {
    const network = await fetch(noRange);
    if (network.ok && network.status === 200) {
      const cache = await caches.open(OFFLINE_CACHE);
      await cache.put(noRange, network.clone());
      return network;
    }
  } catch (_) {}

  return null;
}

async function rangeResponse(request) {
  const full = await findFullResponse(request);
  if (!full) return new Response('', { status: 503 });

  const range = request.headers.get('range');
  if (!range) return full;

  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match) return full;

  const blob = await full.blob();
  const size = blob.size;
  let start;
  let end;

  if (match[1] === '' && match[2] !== '') {
    const suffix = Number(match[2]);
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = match[1] ? Number(match[1]) : 0;
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || start > end) {
    return new Response('', {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` }
    });
  }

  end = Math.min(end, size - 1);
  const chunk = blob.slice(start, end + 1, blob.type || 'audio/mpeg');
  const headers = new Headers(full.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(chunk.size));
  if (blob.type) headers.set('Content-Type', blob.type);

  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers
  });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  if (request.headers.has('range')) {
    event.respondWith(rangeResponse(request));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: false, ignoreVary: true });
    if (cached) return cached;

    try {
      const network = await fetch(request);
      if (network.ok && network.status === 200 && new URL(request.url).origin === self.location.origin) {
        const cache = await caches.open(OFFLINE_CACHE);
        cache.put(request, network.clone()).catch(() => {});
      }
      return network;
    } catch (_) {
      if (request.mode === 'navigate') {
        return (await caches.match('./index.html')) || new Response('Sin conexión', { status: 503 });
      }
      return new Response('', { status: 503 });
    }
  })());
});
