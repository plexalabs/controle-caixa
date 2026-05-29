// demo-topo.js — Sandbox /demo-topo
// Plano de fundo topografico animado: Canvas 2D + Simplex noise 3D
// + marching squares + Chaikin smoothing. Implementacao reutilizavel
// em web/app/topo-bg.js — esta pagina e o sandbox de teste com
// sliders ao vivo.

import { iniciarTopografia } from '../topo-bg.js';

export function renderDemoTopo() {
  document.querySelector('#app').innerHTML = `
    <div class="topo-fundo">
      <canvas id="topo-canvas" class="topo-canvas" aria-hidden="true"></canvas>
      <div class="topo-overlay">
        <div class="topo-badge">
          <span class="topo-badge-dot"></span>
          <span>DEMO · Mapa topográfico animado</span>
        </div>
        <h1 class="topo-titulo">
          Linhas que <em>respiram</em>.
        </h1>
        <p class="topo-corpo">
          Canvas 2D com Simplex Noise 3D (x, y, tempo) processado por
          marching squares + Chaikin smoothing pra extrair isolinhas
          vetorialmente suaves. Movimento orgânico como ondas ou vento,
          sem repetição.
        </p>
        <div class="topo-controles">
          <label class="topo-ctrl">
            <span>Escala</span>
            <input type="range" id="topo-escala" min="0.004" max="0.020" step="0.001" value="0.008">
          </label>
          <label class="topo-ctrl">
            <span>Velocidade</span>
            <input type="range" id="topo-vel" min="0" max="0.0008" step="0.00005" value="0.00025">
          </label>
          <label class="topo-ctrl">
            <span>Níveis</span>
            <input type="range" id="topo-niveis" min="4" max="14" step="1" value="8">
          </label>
        </div>
      </div>
    </div>
  `;

  const canvas = document.querySelector('#topo-canvas');
  const topo = iniciarTopografia(canvas, {
    escala: 0.008, vel: 0.00025, niveis: 8,
  });

  document.querySelector('#topo-escala')?.addEventListener('input', e => topo.setEscala(parseFloat(e.target.value)));
  document.querySelector('#topo-vel')?.addEventListener('input',    e => topo.setVel(parseFloat(e.target.value)));
  document.querySelector('#topo-niveis')?.addEventListener('input', e => topo.setNiveis(parseInt(e.target.value, 10)));

  // Para o loop ao navegar pra outra rota (evita leak)
  window.addEventListener('popstate', () => topo.stop(), { once: true });
}
