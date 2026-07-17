<script>
  import { onMount } from 'svelte';
  import { carregar, brl, quando, janelaCurta, lerEstado, gravarEstado } from '$lib/dados.js';

  let estado = $state({ carregando: true, erro: null, dados: null });
  let local = $state({ favoritos: [], descartados: [] });
  let aba = $state('perfil'); // perfil | tudo | favoritos
  let viajantes = $state(2);
  let perfilId = $derived(estado.dados?.perfis?.[0]?.id ?? 'ale-andreia');

  // "casa" = passou por todos os filtros do perfil. Qualquer outra coisa é o
  // motivo da rejeição, e o app mostra o motivo em vez de sumir com a oferta.
  //
  // Ausência de veredito NÃO é aprovação. O default aqui já foi `?? 'casa'` e
  // isso fazia oferta sem veredito entrar em "Pra nós" por omissão — 47 na
  // aba contra 21 no funil. Silêncio não vota.
  const casa = (o) => o.perfis?.[perfilId] === 'casa';

  onMount(async () => {
    local = lerEstado();
    try {
      estado.dados = await carregar();
    } catch (e) {
      estado.erro = e.message;
    }
    estado.carregando = false;
  });

  const alterna = (lista, id) =>
    lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];

  function favoritar(id) {
    local = { ...local, favoritos: alterna(local.favoritos, id) };
    gravarEstado(local);
  }
  function descartar(id) {
    local = { ...local, descartados: alterna(local.descartados, id) };
    gravarEstado(local);
  }

  let todas = $derived((estado.dados?.ofertas ?? []).filter((o) => !local.descartados.includes(o.id)));
  let noPerfil = $derived(todas.filter(casa));

  let ofertas = $derived.by(() => {
    if (aba === 'favoritos') return todas.filter((o) => local.favoritos.includes(o.id));
    if (aba === 'tudo') return todas;
    return noPerfil;
  });

  let descartadas = $derived((estado.dados?.ofertas ?? []).filter((o) => local.descartados.includes(o.id)));
</script>

<header class="pt-3 pb-5">
  <div class="flex items-baseline justify-between">
    <h1 class="text-2xl font-semibold tracking-tight">Caçador</h1>
    {#if estado.dados}
      <span class="text-xs text-mute">atualizado {quando(estado.dados.gerado_em)}</span>
    {/if}
  </div>
  <p class="text-sm text-mute mt-1">Oportunidades saindo de São Paulo</p>
</header>

{#if estado.carregando}
  <p class="text-mute text-sm">carregando…</p>
{:else if estado.erro}
  <div class="rounded-xl border border-line bg-card p-4">
    <p class="text-sm font-medium">Não consegui carregar as ofertas</p>
    <p class="text-xs text-mute mt-1">{estado.erro}</p>
  </div>
{:else}
  <div class="flex items-center gap-2 mb-4">
    <button
      class="rounded-full px-3 py-1.5 text-sm {aba === 'perfil' ? 'bg-ambar text-ink font-medium' : 'bg-card text-mute'}"
      onclick={() => (aba = 'perfil')}>Pra nós ({noPerfil.length})</button>
    <button
      class="rounded-full px-3 py-1.5 text-sm {aba === 'tudo' ? 'bg-ambar text-ink font-medium' : 'bg-card text-mute'}"
      onclick={() => (aba = 'tudo')}>Tudo ({todas.length})</button>
    <button
      class="rounded-full px-3 py-1.5 text-sm {aba === 'favoritos' ? 'bg-ambar text-ink font-medium' : 'bg-card text-mute'}"
      onclick={() => (aba = 'favoritos')}>★ {local.favoritos.length}</button>
    <div class="ml-auto flex items-center gap-1.5 text-xs text-mute">
      <span>preço p/</span>
      {#each [1, 2] as n}
        <button class="rounded px-2 py-1 {viajantes === n ? 'bg-line text-milk' : 'bg-card'}"
          onclick={() => (viajantes = n)}>{n}</button>
      {/each}
    </div>
  </div>

  {#if !ofertas.length}
    <p class="text-mute text-sm">
      {aba === 'favoritos' ? 'Nenhum favorito ainda — toque na estrela.' : 'Nada aqui ainda.'}
    </p>
  {/if}

  <div class="space-y-3">
    {#each ofertas as o (o.id)}
      <article class="rounded-xl border border-line bg-card p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="font-medium truncate">{o.destino_texto}</h2>
            <p class="text-xs text-mute mt-0.5">
              {o.origem_texto || 'origem não dita'}
              {#if o.escalas === 0}<span class="text-ambar"> · direto</span>
              {:else if o.escalas}<span> · {o.escalas} escala{o.escalas > 1 ? 's' : ''}</span>{/if}
              {#if o.companhia} · {o.companhia}{/if}
            </p>
          </div>
          <div class="text-right shrink-0">
            <div class="text-lg font-semibold tabular-nums">{brl(o.preco_brl * (o.por_pessoa ? viajantes : 1))}</div>
            <div class="text-[10px] text-mute">{o.por_pessoa && viajantes > 1 ? `p/ ${viajantes}` : 'por pessoa'}</div>
          </div>
        </div>

        {#if o.baseline?.tem_baseline}
          <p class="mt-2 text-xs {o.baseline.desvio_pct < 0 ? 'text-ambar' : 'text-mute'}">
            {#if o.baseline.raro}🔥 {/if}
            {o.baseline.desvio_pct < 0 ? `${Math.abs(o.baseline.desvio_pct)}% abaixo` : `${o.baseline.desvio_pct}% acima`}
            da mediana de 90 dias ({brl(o.baseline.mediana)})
          </p>
        {:else if o.baseline}
          <!-- Honestidade: sem série, sem selo. Dizer "abaixo da média" com 2
               amostras seria inventar autoridade. -->
          <p class="mt-2 text-xs text-mute/70">sem baseline ({o.baseline.amostras}/{o.baseline.precisa} dias)</p>
        {/if}

        {#if o.janela}<p class="text-xs text-mute mt-1">{janelaCurta(o.janela)}{o.noites ? ` · ${o.noites} noites` : ''}</p>{/if}
        <!-- Na aba "Tudo", diz POR QUE não é pra vocês. Sumir sem explicar é o
             erro que esconde filtro quebrado atrás de "não teve promoção boa". -->
        {#if aba === 'tudo' && !casa(o)}
          <p class="text-xs text-mute/60 mt-1">fora do perfil: {o.perfis?.[perfilId] ?? 'sem veredito (oferta antiga)'}</p>
        {/if}
        {#if o.bagagem_despachada === 'inclui'}<p class="text-xs text-ambar mt-1">com bagagem despachada</p>{/if}
        {#if o.flags?.length}<p class="text-xs text-amber-500/80 mt-1">⚠ {o.flags.join(', ')} — confira antes de acreditar</p>{/if}

        <div class="flex items-center gap-2 mt-3">
          <a href={o.fontes[0].link} target="_blank" rel="noopener"
            class="rounded-lg bg-line/60 px-3 py-1.5 text-xs">
            {o.fontes[0].nome === 'google-explore' ? 'Google Flights' : 'Melhores Destinos'} ↗
          </a>
          <button class="rounded-lg px-3 py-1.5 text-xs {local.favoritos.includes(o.id) ? 'bg-ambar text-ink' : 'bg-line/60'}"
            onclick={() => favoritar(o.id)}>★</button>
          <button class="ml-auto rounded-lg bg-line/40 px-3 py-1.5 text-xs text-mute"
            onclick={() => descartar(o.id)}>ocultar</button>
        </div>
      </article>
    {/each}
  </div>

  {#if descartadas.length}
    <button class="mt-6 text-xs text-mute underline"
      onclick={() => { local = { ...local, descartados: [] }; gravarEstado(local); }}>
      mostrar {descartadas.length} oculta{descartadas.length > 1 ? 's' : ''}
    </button>
  {/if}

  {#if estado.dados.avisos?.length}
    <div class="mt-6 rounded-xl border border-amber-600/40 bg-amber-950/20 p-3">
      <p class="text-xs font-medium text-amber-400">Avisos do caçador</p>
      {#each estado.dados.avisos as a}<p class="text-xs text-mute mt-1">{a}</p>{/each}
    </div>
  {/if}
{/if}
