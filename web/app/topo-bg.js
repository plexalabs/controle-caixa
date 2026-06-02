// topo-bg.js — Background topografico animado (Canvas 2D + Simplex 3D
// + marching squares + Chaikin smoothing). Reusable: aceita canvas
// pronto + configs, retorna handle com stop() pra desligar o loop
// quando a tela e desmontada (importante pra SPA sem leak de RAF).
//
// Cores: HSL na mesma tonalidade (hue verde do sistema fixo) variando
// saturacao + lightness — externos saturados escuros, internos
// dessaturados claros. Alpha constante (linhas nao "somem").

const DEFAULTS = {
  escala: 0.008,
  vel:    0.00025,
  niveis: 6,        // 8 -> 6: 25% menos passes de marching squares por frame
  seed:   1337,
  cell:   9,        // 7 -> 9: ~1.65x menos celulas no grid
  dprMax: 1.5,      // 1.75 -> 1.5: 25% menos pixels desenhados em telas Retina
  hue:    82,
  fpsCap: 30,       // throttle para 30fps — economia de ~50% CPU sem perda visual
};

export function iniciarTopografia(canvas, opcoes = {}) {
  if (!canvas) return { stop() {} };

  // prefers-reduced-motion: usuario pediu calma — desenha 1 frame estatico
  // e nao roda o RAF loop. Acessibilidade + economia CPU em laptops fracos.
  const reduzido = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const ctx = canvas.getContext('2d');
  const cfg = { ...DEFAULTS, ...opcoes };
  const noise = criarSimplexNoise(cfg.seed);
  let { escala, vel, niveis, cell: CELL, dprMax, hue, fpsCap } = cfg;

  let gridBuf = null;
  let larguraCss, alturaCss, colunas, linhas;
  let rafId = null;
  let t = 0;
  let pausado = false;
  let ultimoFrame = 0;
  const minDelta = 1000 / fpsCap;

  function redimensionar() {
    const dpr = Math.min(window.devicePixelRatio || 1, dprMax);
    // Mede o canvas APOS ele estar no DOM com estilo aplicado.
    // getBoundingClientRect e mais confiavel que clientWidth/Height
    // (que retorna 0 se canvas tem display:none ou pais nao tiveram
    // layout calculado ainda).
    const rect = canvas.getBoundingClientRect();
    larguraCss = Math.round(rect.width)  || window.innerWidth;
    alturaCss  = Math.round(rect.height) || window.innerHeight;
    canvas.width  = Math.floor(larguraCss * dpr);
    canvas.height = Math.floor(alturaCss * dpr);
    canvas.style.width  = larguraCss + 'px';
    canvas.style.height = alturaCss + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    colunas = Math.ceil(larguraCss / CELL) + 1;
    linhas  = Math.ceil(alturaCss  / CELL) + 1;
    gridBuf = new Float32Array(colunas * linhas);
  }
  redimensionar();
  window.addEventListener('resize', redimensionar);

  function corPorLevel(level) {
    const tt = (level + 0.9) / 1.8;
    const sat = Math.round(70 - 45 * tt);
    const lig = Math.round(18 + 60 * tt);
    return `hsla(${hue}, ${sat}%, ${lig}%, 0.72)`;
  }
  function larguraPorLevel(level) {
    const tt = (level + 0.9) / 1.8;
    return 1.3 - 0.4 * tt;
  }

  function extrairSegmentos(level) {
    const segs = [];
    const cols = colunas;
    for (let j = 0; j < linhas - 1; j++) {
      const row0 = j * cols;
      const row1 = row0 + cols;
      for (let i = 0; i < cols - 1; i++) {
        const a = gridBuf[row0 + i]     - level;
        const b = gridBuf[row0 + i + 1] - level;
        const c = gridBuf[row1 + i + 1] - level;
        const d = gridBuf[row1 + i]     - level;

        let code = 0;
        if (a > 0) code |= 1;
        if (b > 0) code |= 2;
        if (c > 0) code |= 4;
        if (d > 0) code |= 8;
        if (code === 0 || code === 15) continue;

        const x = i * CELL;
        const y = j * CELL;
        const pT = () => [x + CELL * (a / (a - b)),     y];
        const pR = () => [x + CELL,                     y + CELL * (b / (b - c))];
        const pB = () => [x + CELL * (d / (d - c)),     y + CELL];
        const pL = () => [x,                            y + CELL * (a / (a - d))];

        switch (code) {
          case 1:  segs.push([pL(), pT()]); break;
          case 2:  segs.push([pT(), pR()]); break;
          case 3:  segs.push([pL(), pR()]); break;
          case 4:  segs.push([pR(), pB()]); break;
          case 5:
            if ((a + b + c + d) / 4 > 0) { segs.push([pL(), pT()]); segs.push([pR(), pB()]); }
            else                          { segs.push([pL(), pB()]); segs.push([pT(), pR()]); }
            break;
          case 6:  segs.push([pT(), pB()]); break;
          case 7:  segs.push([pL(), pB()]); break;
          case 8:  segs.push([pL(), pB()]); break;
          case 9:  segs.push([pT(), pB()]); break;
          case 10:
            if ((a + b + c + d) / 4 > 0) { segs.push([pT(), pR()]); segs.push([pL(), pB()]); }
            else                          { segs.push([pL(), pT()]); segs.push([pR(), pB()]); }
            break;
          case 11: segs.push([pR(), pB()]); break;
          case 12: segs.push([pL(), pR()]); break;
          case 13: segs.push([pT(), pR()]); break;
          case 14: segs.push([pL(), pT()]); break;
        }
      }
    }
    return segs;
  }

  function encadearSegmentos(segs) {
    const KEY = (p) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
    const adj = new Map();
    for (const s of segs) {
      const ka = KEY(s[0]), kb = KEY(s[1]);
      if (!adj.has(ka)) adj.set(ka, []);
      if (!adj.has(kb)) adj.set(kb, []);
      adj.get(ka).push({ pt: s[1], key: kb });
      adj.get(kb).push({ pt: s[0], key: ka });
    }
    const visit = new Set();
    const polys = [];
    const caminhar = (startPt, startKey) => {
      const pts = [startPt];
      let curKey = startKey;
      while (true) {
        const opts = adj.get(curKey) || [];
        let next = null;
        for (const o of opts) {
          const edgeKey = curKey < o.key ? curKey + '|' + o.key : o.key + '|' + curKey;
          if (!visit.has(edgeKey)) {
            visit.add(edgeKey);
            next = o;
            break;
          }
        }
        if (!next) break;
        pts.push(next.pt);
        curKey = next.key;
      }
      return pts;
    };
    for (const s of segs) {
      const ka = KEY(s[0]), kb = KEY(s[1]);
      const edgeKey = ka < kb ? ka + '|' + kb : kb + '|' + ka;
      if (visit.has(edgeKey)) continue;
      visit.add(edgeKey);
      const direita = caminhar(s[1], kb);
      const esquerda = caminhar(s[0], ka);
      const poly = esquerda.reverse().concat(direita);
      if (poly.length >= 2) polys.push(poly);
    }
    return polys;
  }

  function chaikin(pts, iters) {
    for (let i = 0; i < iters; i++) {
      if (pts.length < 3) return pts;
      const out = [pts[0]];
      for (let j = 0; j < pts.length - 1; j++) {
        const p = pts[j], q = pts[j + 1];
        out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]]);
        out.push([0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }

  function desenharContorno(level) {
    ctx.strokeStyle = corPorLevel(level);
    ctx.lineWidth = larguraPorLevel(level);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const segs = extrairSegmentos(level);
    if (segs.length === 0) return;
    const polys = encadearSegmentos(segs);
    ctx.beginPath();
    for (const poly of polys) {
      // 3 iteracoes Chaikin — cada segmento vira 8 sub-segmentos
      // (8x mais pontos), curvas visualmente perfeitas, custo
      // aceitavel ja que ja temos poly chain enxuto.
      const pts = poly.length >= 3 ? chaikin(poly, 3) : poly;
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.stroke();
  }

  function renderizar() {
    ctx.clearRect(0, 0, larguraCss, alturaCss);
    const cols = colunas;
    for (let j = 0; j < linhas; j++) {
      const y = j * CELL * escala;
      const rowOff = j * cols;
      for (let i = 0; i < cols; i++) {
        gridBuf[rowOff + i] = noise.noise3D(i * CELL * escala, y, t);
      }
    }
    for (let k = 0; k < niveis; k++) {
      const level = -0.9 + (1.8 * k) / (niveis - 1);
      desenharContorno(level);
    }
  }

  function frame(now) {
    if (pausado) { rafId = null; return; }
    // Throttle pra fpsCap. RAF roda no rate do display (60/120Hz);
    // a gente decide quando ja deu tempo de renderizar o proximo.
    const delta = now - ultimoFrame;
    if (delta >= minDelta) {
      ultimoFrame = now - (delta % minDelta);
      t += vel;
      renderizar();
    }
    rafId = requestAnimationFrame(frame);
  }

  // Pausa quando a aba nao esta visivel — economia massiva quando o
  // operador minimiza o navegador ou troca de aba.
  function onVisChange() {
    if (document.hidden) {
      pausado = true;
      if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    } else if (pausado) {
      pausado = false;
      ultimoFrame = 0;
      rafId = requestAnimationFrame(frame);
    }
  }
  document.addEventListener('visibilitychange', onVisChange);

  if (reduzido) {
    // 1 frame estatico — visual presente, zero CPU contínuo
    renderizar();
  } else {
    rafId = requestAnimationFrame(frame);
  }

  return {
    stop() {
      pausado = true;
      if (rafId != null) cancelAnimationFrame(rafId);
      rafId = null;
      window.removeEventListener('resize', redimensionar);
      document.removeEventListener('visibilitychange', onVisChange);
    },
    setEscala(v) { escala = v; },
    setVel(v)    { vel = v; },
    setNiveis(v) { niveis = v; },
  };
}

// Simplex 3D — Stefan Gustavson, dominio publico
function criarSimplexNoise(seed = 0) {
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  const grad3 = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  ];
  let s = seed >>> 0;
  const rand = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) {
    perm[i] = base[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  const F3 = 1 / 3, G3 = 1 / 6;
  function noise3D(xin, yin, zin) {
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const X0 = i - t, Y0 = j - t, Z0 = k - t;
    const x0 = xin - X0, y0 = yin - Y0, z0 = zin - Z0;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0)      { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else               { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0)       { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0)  { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else               { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3,     y1 = y0 - j1 + G3,     z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3,  y3 = y0 - 1 + 3 * G3,  z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    const dot = (g, x, y, z) => g[0] * x + g[1] * y + g[2] * z;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0;
    else { t0 *= t0; n0 = t0 * t0 * dot(grad3[permMod12[ii + perm[jj + perm[kk]]]], x0, y0, z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0;
    else { t1 *= t1; n1 = t1 * t1 * dot(grad3[permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]]], x1, y1, z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0;
    else { t2 *= t2; n2 = t2 * t2 * dot(grad3[permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]]], x2, y2, z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0;
    else { t3 *= t3; n3 = t3 * t3 * dot(grad3[permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]]], x3, y3, z3); }
    return 32 * (n0 + n1 + n2 + n3);
  }
  return { noise3D };
}
