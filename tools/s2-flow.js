(async()=>{const s=ms=>new Promise(r=>setTimeout(r,ms));const log=[];const f=document.querySelector('form[data-form=welcome]');if(f){const set=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set(document.querySelector('#w-name'),'Luciano Correa');set(document.querySelector('#w-phone'),'2604000000');f.requestSubmit();await s(1500);}
location.hash='#/rutina';await s(900);
document.querySelector('[data-action="routine-pick"]').click();await s(600);
const form=document.querySelector('form[data-form="routine-add"]');if(!form)return 'NO ROUTINE FORM '+document.body.innerText.slice(0,200);
form.requestSubmit();await s(900);
log.push('rutina: '+document.body.innerText.replace(/\s+/g,' ').slice(0,180));
document.querySelector('[data-action="routine-save"]').click();await s(1400);
log.push('guardada: '+document.body.innerText.replace(/\s+/g,' ').slice(0,160));
location.hash='#/reservar?a=jiujitsu';await s(1000);
const b=document.querySelector('[data-action="ask-book"]');if(!b)return JSON.stringify(log.concat('NO BOOK BTN '+document.body.innerText.slice(0,200)));
b.click();await s(700);
const ok=document.querySelector('[data-action="do-book"]');if(!ok)return JSON.stringify(log.concat('NO CONFIRM'));
ok.click();await s(1400);
location.hash='#/turnos';await s(900);
log.push('turnos: '+document.body.innerText.replace(/\s+/g,' ').slice(0,260));
return JSON.stringify(log)})()
