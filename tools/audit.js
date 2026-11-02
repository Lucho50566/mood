(async () => {
  const s = (ms) => new Promise((r) => setTimeout(r, ms));
  const f = document.querySelector('form[data-form=welcome]');
  if (f) {
    const set = (el, v) => { Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    set(document.querySelector('#w-name'), 'Luciano Correa');
    set(document.querySelector('#w-phone'), '2604000000');
    f.requestSubmit();
    await s(400);
  }
  const out = [];
  for (const h of ['#/inicio', '#/reservar', '#/turnos', '#/abonos', '#/perfil']) {
    location.hash = h;
    await s(450);
    const app = document.querySelector('.app');
    out.push({
      h,
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      padBottom: getComputedStyle(app).paddingBottom,
      text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 320),
    });
  }
  return JSON.stringify(out, null, 1);
})()
