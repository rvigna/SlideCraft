/* Export the deck as a single self-contained HTML slideshow. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Deck } from '../model/types';
import { escapeHtml } from '../model/richtext';
import { AnimatedSlide } from '../components/AnimatedSlide';
import { GOOGLE_FONTS_URL } from '../model/fonts';


export function deckToHtml(deck: Deck): string {
  const slides = deck.slides.map((slide, i) => {
    const markup = renderToStaticMarkup(createElement(AnimatedSlide, { slide, mode: 'auto' }));
    return `<section class="slide" data-index="${i}" data-transition="${slide.transition}" style="--dur:${slide.transitionDuration}s">${markup}</section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(deck.title)}</title>
<meta name="generator" content="SlideCraft">
<link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#000;overflow:hidden;font-family:'IBM Plex Sans',sans-serif}
#deck{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}
.slide{position:absolute;width:960px;height:540px;display:none;transform-origin:center}
.slide.active{display:block}
.slide ul,.slide ol{padding-left:1.4em}
.slide.t-fade{animation:fade var(--dur) ease}
.slide.t-slide-left{animation:sl var(--dur) ease}.slide.t-slide-right{animation:sr var(--dur) ease}
.slide.t-slide-up{animation:su var(--dur) ease}.slide.t-slide-down{animation:sd var(--dur) ease}
.slide.t-zoom-in{animation:zi var(--dur) ease}.slide.t-zoom-out{animation:zo var(--dur) ease}
.slide.t-rise{animation:ri var(--dur) ease}.slide.t-soft-zoom{animation:sz var(--dur) ease}
@keyframes ri{from{opacity:0;translate:0 3%}}@keyframes sz{from{opacity:0;scale:.97}}
.sc-anim{animation-fill-mode:both;animation-timing-function:cubic-bezier(0,0,.38,.9)}
.sc-anim-fade{animation-name:af}.sc-anim-rise{animation-name:ar}.sc-anim-zoom{animation-name:az}.sc-anim-wipe{animation-name:aw}
@keyframes af{from{opacity:0}}@keyframes ar{from{opacity:0;translate:0 16px}}@keyframes az{from{opacity:0;scale:1.06}}
@keyframes aw{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}
li.sc-anim{display:list-item}
@media (prefers-reduced-motion:reduce){.slide,.sc-anim{animation-duration:1ms!important;animation-delay:0s!important}}
@keyframes fade{from{opacity:0}}
@keyframes sl{from{translate:100% 0}}@keyframes sr{from{translate:-100% 0}}
@keyframes su{from{translate:0 100%}}@keyframes sd{from{translate:0 -100%}}
@keyframes zi{from{opacity:0;scale:.3}}@keyframes zo{from{opacity:0;scale:1.5}}
#bar{position:fixed;left:0;bottom:0;height:3px;background:#0f62fe;transition:width .3s}
#hud{position:fixed;right:16px;bottom:12px;color:#c6c6c6;font:12px 'IBM Plex Mono',monospace;opacity:0;transition:opacity .3s}
body:hover #hud{opacity:1}
@media print{html,body{background:#fff;overflow:visible;height:auto}#deck{position:static;display:block}
.slide{display:block!important;position:relative;transform:none!important;page-break-after:always;animation:none!important}
#bar,#hud{display:none}@page{size:960px 540px;margin:0}}
</style>
</head>
<body>
<div id="deck">
${slides}
</div>
<div id="bar"></div>
<div id="hud"></div>
<script>
(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide')),i=0;
  function fit(){var s=Math.min(innerWidth/960,innerHeight/540);slides.forEach(function(el){el.style.transform='scale('+s+')';});}
  function show(n,anim){
    i=Math.max(0,Math.min(slides.length-1,n));
    slides.forEach(function(el,k){el.className='slide'+(k===i?' active':'');});
    var el=slides[i],t=el.getAttribute('data-transition');
    if(anim&&t&&t!=='none'){void el.offsetWidth;el.classList.add('t-'+t);}
    document.getElementById('bar').style.width=((i+1)/slides.length*100)+'%';
    document.getElementById('hud').textContent=(i+1)+' / '+slides.length;
    history.replaceState(null,'','#'+(i+1));
  }
  addEventListener('keydown',function(e){
    if(['ArrowRight','ArrowDown','PageDown',' ','Enter'].indexOf(e.key)>=0){e.preventDefault();show(i+1,true);}
    else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].indexOf(e.key)>=0){e.preventDefault();show(i-1,true);}
    else if(e.key==='Home')show(0,true);else if(e.key==='End')show(slides.length-1,true);
    else if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();}
  });
  addEventListener('click',function(e){show(e.clientX<innerWidth/3?i-1:i+1,true);});
  addEventListener('resize',fit);
  fit();show((parseInt(location.hash.slice(1))||1)-1,false);
})();
</script>
</body>
</html>`;
}
