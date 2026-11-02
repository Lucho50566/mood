(async()=>{const s=ms=>new Promise(r=>setTimeout(r,ms));const f=document.querySelector('form[data-form=welcome]');if(f){const set=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};set(document.querySelector('#w-name'),'Luciano Correa');set(document.querySelector('#w-phone'),'2604000000');f.requestSubmit();await s(1500);}
location.hash='#/abonos';await s(900);
document.querySelector('[data-action="ask-plan"][data-plan="small"]').click();await s(600);
const pay=document.querySelector('[data-action="pay-plan"]');if(!pay)return 'NO PAY BTN '+document.body.innerText.slice(0,220);
pay.click();await s(1600);
return document.body.innerText.replace(/\s+/g,' ').slice(0,320)})()
