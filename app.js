(() => {
  'use strict';

  const OFFLINE_CACHE = 'parque-offline-v5';
  const btn = document.getElementById('downloadBtn');
  const status = document.getElementById('status');

  // Registrar el service worker y forzar la comprobación de una versión nueva.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js', { updateViaCache: 'none' })
      .then(reg => reg.update().catch(() => {}))
      .catch(err => console.error('No se pudo registrar el service worker', err));
  }

  function collectOfflineAssets() {
    const urls = new Set([
      './',
      './index.html',
      './app.js',
      './style.css',
      './manifest.webmanifest',
      './sw.js'
    ]);

    // Mantener compatibilidad con la lista que ya existe en index.html.
    if (Array.isArray(window.OFFLINE_ASSETS)) {
      window.OFFLINE_ASSETS.forEach(url => urls.add(url));
    }

    // Además descubrir automáticamente todos los audios e imágenes visibles en la página.
    document.querySelectorAll('audio[src], img[src]').forEach(el => {
      const src = el.getAttribute('src');
      if (src) urls.add(src);
    });

    return [...urls];
  }

  async function waitForServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.ready;
    } catch (_) {}
  }

  async function cacheOne(cache, asset) {
    const absoluteUrl = new URL(asset, window.location.href).href;
    const request = new Request(absoluteUrl, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });

    const response = await fetch(request);
    if (!response.ok || response.status !== 200) {
      throw new Error(`HTTP ${response.status} en ${asset}`);
    }

    await cache.put(request, response.clone());
  }

  if (btn && status) {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Descargando…';
      status.textContent = 'Preparando la audioguía para uso sin conexión…';

      try {
        await waitForServiceWorker();

        if (navigator.storage?.persist) {
          try { await navigator.storage.persist(); } catch (_) {}
        }

        const assets = collectOfflineAssets();
        if (!assets.length) throw new Error('No se encontraron archivos para descargar');

        const cache = await caches.open(OFFLINE_CACHE);
        let done = 0;
        const failed = [];

        for (const asset of assets) {
          try {
            await cacheOne(cache, asset);
          } catch (error) {
            console.warn('No se pudo guardar', asset, error);
            failed.push(asset);
          }

          done += 1;
          const pct = Math.round((done / assets.length) * 100);
          status.textContent = `Descargando contenido… ${pct}%`;
        }

        if (failed.length) {
          status.textContent = `La descarga quedó incompleta (${failed.length} archivo${failed.length === 1 ? '' : 's'}). Mantené la conexión e intentá nuevamente.`;
          btn.disabled = false;
          btn.textContent = 'Reintentar descarga sin conexión';
          return;
        }

        localStorage.setItem('parque-offline-version', 'v5');
        localStorage.setItem('parque-offline-complete', '1');
        status.textContent = '✓ Audioguía descargada. Ya podés usarla sin conexión.';
        btn.textContent = 'Audioguía disponible sin conexión';
      } catch (error) {
        console.error('Error de descarga offline', error);
        status.textContent = 'No se pudo completar la descarga. Mantené la conexión e intentá nuevamente.';
        btn.disabled = false;
        btn.textContent = 'Reintentar descarga sin conexión';
      }
    });
  } else {
    console.error('No se encontraron downloadBtn/status en la página');
  }

  function fmt(s) {
    if (!Number.isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  document.querySelectorAll('[data-audio-ui]').forEach(ui => {
    const audio = ui.querySelector('.audio-el');
    const play = ui.querySelector('.play');
    const seek = ui.querySelector('.seek');
    const cur = ui.querySelector('.current-time');
    const dur = ui.querySelector('.duration');
    if (!audio || !play || !seek || !cur || !dur) return;

    const syncDuration = () => { dur.textContent = fmt(audio.duration); };
    audio.addEventListener('loadedmetadata', syncDuration);
    audio.addEventListener('durationchange', syncDuration);
    audio.addEventListener('timeupdate', () => {
      cur.textContent = fmt(audio.currentTime);
      if (audio.duration) seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
    });
    audio.addEventListener('play', () => {
      play.textContent = '❚❚';
      play.setAttribute('aria-label', 'Pausar audio');
    });
    audio.addEventListener('pause', () => {
      play.textContent = '▶';
      play.setAttribute('aria-label', 'Reproducir audio');
    });
    audio.addEventListener('ended', () => { play.textContent = '▶'; });
    play.addEventListener('click', () => audio.paused ? audio.play() : audio.pause());

    ui.querySelectorAll('[data-skip]').forEach(b => b.addEventListener('click', () => {
      audio.currentTime = Math.max(0, Math.min(audio.duration || Infinity, audio.currentTime + Number(b.dataset.skip)));
    }));

    seek.addEventListener('input', () => {
      if (audio.duration) audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
    });
  });

  document.querySelectorAll('.carousel-wrap').forEach(wrap => {
    const rail = wrap.querySelector('.carousel');
    if (!rail) return;
    const move = dir => rail.scrollBy({ left: dir * rail.clientWidth * 0.8, behavior: 'smooth' });
    wrap.querySelector('.carousel-arrow.left')?.addEventListener('click', () => move(-1));
    wrap.querySelector('.carousel-arrow.right')?.addEventListener('click', () => move(1));
  });
})();
