// recuperar.js — placeholder. Implementação completa no CP2.

export function renderRecuperar() {
  document.querySelector('#app').innerHTML = `
    <main id="main" class="min-h-screen flex items-center justify-center p-8">
      <div class="max-w-sm text-center">
        <p class="h-eyebrow">CP2</p>
        <h1 class="h-display text-4xl mt-1 mb-4">Recuperar senha</h1>
        <p class="text-body text-sm mb-6">
          Em construção no Checkpoint 2: fluxo via OTP de 6 dígitos para redefinir senha.
        </p>
        <a href="/login" data-link class="btn-link">Voltar ao login</a>
      </div>
    </main>`;
}
