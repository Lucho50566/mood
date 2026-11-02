(async()=>{const s=ms=>new Promise(r=>setTimeout(r,ms));const f=document.querySelector('form[data-form=welcome]');if(f){const set=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set(document.querySelector('#w-name'),'Luciano Correa');set(document.querySelector('#w-phone'),'2604000000');f.requestSubmit();await s(500);}
location.hash='#/reservar?a=jiujitsu';await s(800);
const btn=document.querySelector('[data-action="ask-book"]');
if(!btn)return 'NO_BTN '+document.body.innerText.slice(0,200);
btn.click();await s(500);
const conf=document.querySelector('[data-action="do-book"]');
if(!conf)return 'NO_CONFIRM '+document.body.innerText.slice(0,300);
conf.click();await s(700);
location.hash='#/turnos';await s(700);
const txt=document.body.innerText.replace(/\s+/g,' ');
const st=JSON.parse(localStorage.getItem('mood.club.v5'));
return JSON.stringify({texto:txt.slice(0,320),reservas:st.bookings.filter(b=>b.member==='me').map(b=>({a:b.activityId,d:b.date,t:b.time,code:b.code}))})})()
