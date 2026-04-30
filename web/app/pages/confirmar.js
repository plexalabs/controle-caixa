// confirmar.js — placeholder. Implementação completa no CP2.

export function renderConfirmar() {
  const email = new URLSearchParams(location.search).get('email') ?? '';
  document.querySelector('#app').innerHTML = `
    <main id="main" class="min-h-screen flex items-center justify-center p-8">
      <div class="max-w-sm text-center">
        <p class="h-eyebrow">CP2</p>
        <h1 class="h-display text-4xl mt-1 mb-4">Confirmar email</h1>
        <p class="text-body text-sm mb-2">
          Em construção. No Checkpoint 2 esta tela vai pedir o código de 6 dígitos
          que foi enviado para <strong>${email || 'seu email'}</strong>.
        </p>
        <p class="text-body text-sm mb-6">
          Por enquanto, confirme via API ou Dashboard do Supabase.
        </p>
        <a href="/login" data-link class="btn-link">Voltar ao login</a>
      </div>
    </main>`;
}
