/**
 * Lift: the volume control. A rounded pillar on a plinth, drawn with the Hairline kernel.
 * Grab it and drag up or down: the pillar follows the hand, gives at 0 and 100 (rubber band),
 * catches lightly on every 10% when moving slowly, and a flick carries on to the next 10% step.
 * A row of eleven dots on the plinth's front edge lights up to the level, spreading out from
 * the change. One bright mark only: the level dot at rest, the pillar's outline while held.
 * Scroll and the arrow keys work too (it is a real slider for screen readers).
 */
const {
  Cam, fit, proj, facing, rings, prism, solid, put, mk, flatDot, place,
  spring, stepS, tween, tset, tval, tdone, register, disposer, clamp, ringAt, poly, rrect,
} = window.HL;

const W = 120, PB = 7, FOOT = [34, 34, 86, 86], HMIN = 3, HMAX = 92;
const TRAVEL = 150;                    // screen px of drag for 0 → 100%
const H = v => HMIN + v * (HMAX - HMIN);
const rubber = (o, d = 0.35, c = 0.55) => (o * d * c) / (d + c * Math.abs(o));

export function lift(stage, { value = 1, label = 'Volume', onInput }) {
  window.HL.inject(document);
  stage.setAttribute('data-hairline', 'lift');
  stage.setAttribute('role', 'slider');
  stage.setAttribute('tabindex', '0');
  stage.setAttribute('aria-label', label);
  stage.setAttribute('aria-valuemin', '0');
  stage.setAttribute('aria-valuemax', '100');

  const bag = disposer();
  const svg = mk('svg', { viewBox: '0 0 400 250', 'aria-hidden': 'true' }, stage);
  const C = Cam(45, 0.5, 1.5);
  fit(C, [[-4, -4, -PB], [W + 4, W + 4, -PB], [W + 4, -4, 0], [-4, W + 4, 0], [FOOT[0], FOOT[1], HMAX], [FOOT[2], FOOT[3], HMAX]], 200, 128);
  const P = proj(C), front = facing(C);

  const g = mk('g', {}, svg);
  // Plinth: a thin plate, a second line for its thickness.
  const [pr, pi] = rings(-4, -4, W + 4, W + 4, 12, 2.2);
  put(solid(g), prism(P, front, pr, pi, -PB, 0));
  // The pillar's well: a dim ring on the plinth where it stands.
  const well = rrect(FOOT[0] - 5, FOOT[1] - 5, FOOT[2] + 5, FOOT[3] + 5, 11, 4);
  mk('path', { d: poly(ringAt(P, well, 0)), class: 'lo nf' }, g);
  // The ceiling: a dashed guide where 100% would be, painted behind the pillar.
  const [fr, fi] = rings(...FOOT, 9, 1.6);
  mk('path', { d: poly(ringAt(P, fr, HMAX)), class: 'dash nf' }, g);
  const pillar = solid(g);

  // Eleven level dots along the plinth's front-left edge, 0% far left to 100% near right.
  const dotsG = mk('g', {}, g), dots = [];
  for (let i = 0; i <= 10; i++) {
    const el = flatDot(dotsG, C, 1.7, 'dot off');
    place(el, P(8 + i * (W - 16) / 10, W - 6, 0));
    dots.push({ el, tw: tween(0), cls: '' });
  }

  let v = clamp(value, 0, 1);           // the level, 0..1
  let shown = v;                         // what the pillar shows (may overshoot while dragging)
  let held = false, hover = false, drag = null;
  const sp = spring(H(v), { k: 260, c: 32 });
  let drawnH = NaN, drawnHi = null;

  function emit() {
    stage.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    stage.setAttribute('aria-valuetext', Math.round(v * 100) + '%');
    onInput?.(v);
  }

  function aim(now) {
    sp.t = H(shown);
    const lit = Math.round(v * 10);
    dots.forEach((d, i) => tset(d.tw, i <= lit && v > 0 ? 1 : 0, now, Math.abs(i - lit) * 40));
    B.wake();
  }

  const B = register(stage, (dt, now) => {
    const moving = stepS(sp, dt);
    const h = Math.max(HMIN * 0.6, sp.x);
    if (h !== drawnH) { drawnH = h; put(pillar, prism(P, front, fr, fi, 0, h)); }
    const hi = held || hover;
    if (hi !== drawnHi) { drawnHi = hi; pillar.sil.classList.toggle('hi', hi); }
    let pending = false;
    const top = Math.round(v * 10);
    dots.forEach((d, i) => {
      const on = tval(d.tw, now) > 0.5;
      const cls = !on ? 'dot off' : (i === top && !hi ? 'dot' : 'dot m');
      if (cls !== d.cls) { d.cls = cls; d.el.setAttribute('class', cls); }
      if (!tdone(d.tw, now)) pending = true;
    });
    return moving || pending;
  });
  bag.add(B.unregister);

  function setLevel(nv, { snap = false, from = 'user' } = {}) {
    nv = clamp(nv, 0, 1);
    if (snap) nv = Math.round(nv * 10) / 10;
    nv = Math.round(nv * 100) / 100;
    const changed = nv !== v;
    v = nv; if (!drag) shown = v;
    aim(performance.now());
    if (changed && from === 'user') emit();
  }

  // Direct manipulation: pointer down grabs, the pillar follows 1:1 from where you grabbed.
  const onDown = e => {
    if (e.button !== 0) return;
    try { stage.setPointerCapture(e.pointerId); } catch {}
    held = true; stage.classList.add('is-held');
    drag = { y: e.clientY, v0: v, hist: [[e.timeStamp, v]] };
    B.wake();
    e.preventDefault();
  };
  const onMove = e => {
    if (!drag) return;
    const raw = drag.v0 + (drag.y - e.clientY) / TRAVEL;
    let nv = clamp(raw, 0, 1);
    // Soft edge past 0 and 100.
    shown = raw > 1 ? 1 + rubber(raw - 1) : raw < 0 ? rubber(raw) : raw;
    drag.hist.push([e.timeStamp, raw]); if (drag.hist.length > 6) drag.hist.shift();
    // Light catch on 10% steps while moving slowly.
    const [t0, a] = drag.hist[0], speed = Math.abs((raw - a) / Math.max(1, e.timeStamp - t0) * 1000);
    const near = Math.round(nv * 10) / 10;
    if (speed < 0.35 && Math.abs(nv - near) < 0.015) nv = near;
    if (raw >= 0 && raw <= 1) shown = nv;
    const changed = Math.round(nv * 100) / 100 !== v;
    v = Math.round(nv * 100) / 100;
    aim(e.timeStamp);
    if (changed) emit();
  };
  const onUp = e => {
    if (!drag) return;
    const [t0, a] = drag.hist[0], [t1, b] = drag.hist[drag.hist.length - 1];
    const vel = (b - a) / Math.max(1, t1 - t0) * 1000;   // level per second
    drag = null; held = false; stage.classList.remove('is-held');
    // A flick: project where it was going and land on that 10% step.
    // capped at two steps, so a flick nudges the level and never jumps to mute or full.
    if (Math.abs(vel) > 1.2) setLevel(v + clamp(vel * 0.99 / (1 - 0.99) / 1000, -0.2, 0.2), { snap: true });
    else { shown = v; aim(performance.now()); }
    try { stage.releasePointerCapture(e.pointerId); } catch {}
  };
  const onWheel = e => { e.preventDefault(); setLevel(v - e.deltaY / 600); };
  const onKey = e => {
    const step = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01, PageUp: 0.1, PageDown: -0.1 }[e.key];
    if (step !== undefined) { e.preventDefault(); setLevel(v + step * (e.shiftKey ? 10 : 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setLevel(0); }
    else if (e.key === 'End') { e.preventDefault(); setLevel(1); }
  };
  const onEnter = () => { hover = true; B.wake(); };
  const onLeave = () => { hover = false; B.wake(); };
  for (const [t, f, o] of [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp],
    ['wheel', onWheel, { passive: false }], ['keydown', onKey], ['pointerenter', onEnter], ['pointerleave', onLeave]])
    bag.on ? bag.on(stage, t, f, o) : (stage.addEventListener(t, f, o), bag.add(() => stage.removeEventListener(t, f, o)));
  bag.add(() => svg.remove());

  stage.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  aim(performance.now());

  return {
    set: nv => setLevel(nv, { from: 'outside' }),
    get value() { return v; },
    destroy: bag.dispose,
  };
}
