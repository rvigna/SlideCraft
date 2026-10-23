/* Export the deck as a single self-contained HTML slideshow. */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Deck } from '../model/types';
import { escapeHtml } from '../model/richtext';
import { SlideStage } from '../components/SlideObjectView';

const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,600;0,700;1,400&family=IBM+Plex+Serif:ital,wght@0,400;0,600;0,700;1,400&family=Inter:wght@300;400;500;600;700;800;900&family=Lato:wght@300;400;700;900&family=Montserrat:wght@300;400;500;600;700;800;900&family=Open+Sans:wght@300;400;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,400&family=Poppins:wght@300;400;500;600;700&family=Roboto:wght@300;400;500;700&family=Source+Code+Pro:wght@400;500&display=swap';

export function deckToHtml(deck: Deck): string {
  const slides = deck.slides.map((slide, i) => {
    const markup = renderToStaticMarkup(createElement(SlideStage, { slide }));
    return `<section class="slide" data-index="${i}" data-transition="${slide.transition}" style="--dur:${slide.transitionDuration}s">${markup}</section>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(deck.title)}</title>
<meta name="generator" content="SlideCraft">
<link href="${FONTS}" rel="stylesheet">
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
