if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}
const btn=document.getElementById('downloadBtn'), status=document.getElementById('status');
btn.addEventListener('click', async ()=>{
  btn.disabled=true; status.textContent='Preparando la audioguía para uso sin conexión…';
  try{
    const cache=await caches.open('parque-offline-v3');
    let done=0;
    for(const asset of window.OFFLINE_ASSETS){
      try{await cache.add(asset);}catch(e){console.warn('No se pudo guardar',asset,e)}
      done++; status.textContent=`Descargando contenido… ${Math.round(done/window.OFFLINE_ASSETS.length*100)}%`;
    }
    status.textContent='✓ Audioguía descargada. Ya podés usarla sin conexión.';
    btn.textContent='Audioguía disponible sin conexión';
  }catch(e){
    status.textContent='No se pudo completar la descarga. Mantené la conexión e intentá nuevamente.';
    btn.disabled=false;
  }
});

function fmt(s){
  if(!Number.isFinite(s)) return '0:00';
  const m=Math.floor(s/60), sec=Math.floor(s%60).toString().padStart(2,'0');
  return `${m}:${sec}`;
}

document.querySelectorAll('[data-audio-ui]').forEach(ui=>{
  const audio=ui.querySelector('.audio-el');
  const play=ui.querySelector('.play');
  const seek=ui.querySelector('.seek');
  const cur=ui.querySelector('.current-time');
  const dur=ui.querySelector('.duration');
  const syncDuration=()=>{dur.textContent=fmt(audio.duration)};
  audio.addEventListener('loadedmetadata',syncDuration);
  audio.addEventListener('durationchange',syncDuration);
  audio.addEventListener('timeupdate',()=>{
    cur.textContent=fmt(audio.currentTime);
    if(audio.duration) seek.value=Math.round((audio.currentTime/audio.duration)*1000);
  });
  audio.addEventListener('play',()=>{play.textContent='❚❚'; play.setAttribute('aria-label','Pausar audio')});
  audio.addEventListener('pause',()=>{play.textContent='▶'; play.setAttribute('aria-label','Reproducir audio')});
  audio.addEventListener('ended',()=>{play.textContent='▶'});
  play.addEventListener('click',()=>audio.paused?audio.play():audio.pause());
  ui.querySelectorAll('[data-skip]').forEach(b=>b.addEventListener('click',()=>{
    audio.currentTime=Math.max(0,Math.min(audio.duration||Infinity,audio.currentTime+Number(b.dataset.skip)));
  }));
  seek.addEventListener('input',()=>{if(audio.duration) audio.currentTime=(Number(seek.value)/1000)*audio.duration});
});

document.querySelectorAll('.carousel-wrap').forEach(wrap=>{
  const rail=wrap.querySelector('.carousel');
  const move=(dir)=>rail.scrollBy({left:dir*rail.clientWidth*.8,behavior:'smooth'});
  wrap.querySelector('.carousel-arrow.left')?.addEventListener('click',()=>move(-1));
  wrap.querySelector('.carousel-arrow.right')?.addEventListener('click',()=>move(1));
});
