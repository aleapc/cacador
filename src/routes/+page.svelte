<script>
  import { onMount } from 'svelte';
  import { carregar, brl, quando, janelaCurta, lerEstado, gravarEstado } from '$lib/dados.js';
  import { TIPOS, TIPO_LABEL, CONTINENTES, CONT_LABEL, flag } from '$lib/filtros.js';

  const FONTE_NOME = {
    'melhores-destinos': 'Melhores Destinos', 'google-explore': 'Google Flights',
    'tg:melhoresdestinos': 'Melhores Destinos', 'tg:passageirodeprimeira': 'Passageiro de Primeira',
    'tg:canalpontospravoar': 'Pontos pra Voar', 'tg:promopassagens': 'PromoPassagens',
  };
  const nomeFonte = (n) => FONTE_NOME[n] || (n?.startsWith('tg:') ? n.slice(3) : n || 'fonte');

  let estado = $state({ carregando: true, erro: null, dados: null });
  let local = $state({ favoritos: [], descartados: [] });

  // seletor de pessoa: id da pessoa, ou "nos" (os dois)
  let pessoa = $state('nos');
  let viajantes = $state(2);

  // filtros de visão (só no aparelho, instantâneos, sem servidor)
  let tipos = $state(new Set());
  let continentes = $state(new Set());
  let paises = $state(new Set());
  let precoMax = $state(4000);
  let extra = $state({ visto: false, match: false, deal: false, direto: false });
  let sheet = $state(false);
  let seg = $state('tipo');

  onMount(async () => {
    local = lerEstado();
    try {
      estado.dados = await carregar();
      viajantes = estado.dados.perfis?.[0]?.viajantes ?? 2;
    } catch (e) {
      estado.erro = e.message;
    }
    estado.carregando = false;
  });

  let pessoas = $derived(estado.dados?.pessoas ?? []);
  const nomePessoa = (id) => pessoas.find((p) => p.id === id)?.nome ?? id;

  const curte = (o, id) => o.gosto?.[id] === true;

  // Filtro de visão: origem de casa, não descartado, não doméstico, dentro do
  // preço, e o que a pessoa/tipos/lugares/extras pedirem. Tudo client-side.
  function passa(o) {
    if (local.descartados.includes(o.id)) return false;
    if (o.origem_metro && o.origem_metro !== 'SAO') return false; // só o que sai de SP
    // Doméstico fora — checa as DUAS formas de dizer Brasil (iso2 pode vir
    // vazio se a taxonomia não casou; o pais_texto do Explore ainda diz).
    if (/^BR$/i.test(o.pais_iso2 || '') || /^brasil$/i.test(o.pais_texto || '')) return false;
    if (o.preco_brl > precoMax) return false;
    if (pessoa !== 'nos' && !curte(o, pessoa)) return false;
    if (tipos.size && !(o.tipos || []).some((t) => tipos.has(t))) return false;
    if (continentes.size && !continentes.has(o.continente)) return false;
    if (paises.size && !paises.has(o.pais_iso2)) return false;
    if (extra.visto && o.sem_visto !== true) return false;
    if (extra.match && !o.match) return false;
    if (extra.direto && o.escalas !== 0) return false;
    if (extra.deal && !(o.baseline?.raro || (o.baseline?.tem_baseline && o.baseline.desvio_pct < 0) || o.insight?.nivel === 'low')) return false;
    return true;
  }

  const pontos = (o) =>
    (o.match ? 5000 : 0) +
    (o.baseline?.raro ? 1000 : 0) +
    (o.insight?.nivel === 'low' ? 800 : 0) -
    (o.baseline?.desvio_pct ?? o.insight?.desvio_pct ?? 0);

  let ofertas = $derived.by(() => {
    let ds = (estado.dados?.ofertas ?? []).filter(passa);
    // dedup por destino: mantém a mais barata de cada destino na visão
    const porDest = new Map();
    for (const o of ds) {
      const k = o.destino_metro || o.destino_texto;
      if (!porDest.has(k) || o.preco_brl < porDest.get(k).preco_brl) porDest.set(k, o);
    }
    ds = [...porDest.values()];
    return ds.sort((a, b) => pontos(b) - pontos(a) || a.preco_brl - b.preco_brl);
  });

  let matches = $derived(ofertas.filter((o) => o.match).length);
  let favoritas = $derived(
    (estado.dados?.ofertas ?? []).filter((o) => local.favoritos.includes(o.id)),
  );

  // contagem viva pro botão da gaveta (ignora só o descarte, aplica os filtros)
  let contagem = $derived(ofertas.length);

  const alterna = (lista, id) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  function favoritar(id) {
    local = { ...local, favoritos: alterna(local.favoritos, id) };
    gravarEstado(local);
  }
  function descartar(id) {
    local = { ...local, descartados: alterna(local.descartados, id) };
    gravarEstado(local);
  }
  const toggleSet = (s, k) => {
    const n = new Set(s);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  };

  // países presentes por continente (pra gaveta de Lugar)
  let paisesPorCont = $derived.by(() => {
    const m = {};
    for (const o of estado.dados?.ofertas ?? []) {
      if (!o.continente || !o.pais_iso2) continue;
      (m[o.continente] ??= new Map()).set(o.pais_iso2, o.pais_iso2);
    }
    return m;
  });
  let contAberto = $state(new Set());

  let filtrosAtivos = $derived([
    ...[...tipos].map((t) => ['tipo', t, TIPO_LABEL[t]]),
    ...[...continentes].map((c) => ['cont', c, CONT_LABEL[c]]),
    ...[...paises].map((p) => ['pais', p, `${flag(p)} ${p}`]),
    ...(precoMax !== 4000 ? [['preco', 'preco', `até ${brl(precoMax)}`]] : []),
    ...(extra.visto ? [['x', 'visto', 'sem visto']] : []),
    ...(extra.match ? [['x', 'match', '💛 os dois']] : []),
    ...(extra.deal ? [['x', 'deal', '📊 abaixo da média']] : []),
    ...(extra.direto ? [['x', 'direto', 'direto']] : []),
  ]);
  function removerFiltro(tipo, k) {
    if (tipo === 'tipo') tipos = toggleSet(tipos, k);
    else if (tipo === 'cont') continentes = toggleSet(continentes, k);
    else if (tipo === 'pais') paises = toggleSet(paises, k);
    else if (tipo === 'preco') precoMax = 4000;
    else if (tipo === 'x') extra = { ...extra, [k]: false };
  }
</script>

<header class="pt-3 pb-2">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <div class="mark"></div>
      <h1 class="text-xl font-semibold tracking-tight">Caçador</h1>
    </div>
    {#if estado.dados}<span class="text-[11px] text-mute">{quando(estado.dados.gerado_em)}</span>{/if}
  </div>
</header>

{#if estado.carregando}
  <p class="text-mute text-sm mt-4">carregando…</p>
{:else if estado.erro}
  <div class="rounded-xl border border-line bg-card p-4 mt-3">
    <p class="text-sm font-medium">Não consegui carregar as ofertas</p>
    <p class="text-xs text-mute mt-1">{estado.erro}</p>
  </div>
{:else}
  <!-- seletor de pessoa -->
  {#if pessoas.length >= 2}
    <div class="people mt-2">
      <button class:on={pessoa === pessoas[0].id} onclick={() => (pessoa = pessoas[0].id)}>
        <span class="pd" style="background:#38BDF8"></span>{pessoas[0].nome}
      </button>
      <button class:on={pessoa === pessoas[1].id} onclick={() => (pessoa = pessoas[1].id)}>
        <span class="pd" style="background:#F472B6"></span>{pessoas[1].nome}
      </button>
      <button class="nos" class:on={pessoa === 'nos'} onclick={() => (pessoa = 'nos')}>
        <span class="pd" style="background:#F5A524"></span>Nós dois
      </button>
    </div>
  {/if}

  <!-- barra de filtros -->
  <div class="fbar mt-3">
    <button class="fbtn primary" onclick={() => (sheet = true)}>⚲ Filtros</button>
    {#each filtrosAtivos as [tipo, k, txt] (tipo + k)}
      <span class="fchip">{txt}<button class="x" onclick={() => removerFiltro(tipo, k)}>×</button></span>
    {/each}
  </div>

  <div class="countline mt-3">
    {ofertas.length}
    {ofertas.length === 1 ? 'oportunidade' : 'oportunidades'}
    {pessoa === 'nos' ? 'no radar' : `que ${nomePessoa(pessoa)} curtiria`}
    {#if pessoa === 'nos' && matches}<span class="text-ambar"> · 💛 {matches} agradam os dois</span>{/if}
  </div>

  {#if !ofertas.length}
    <p class="text-mute text-sm mt-4">Nada com esses filtros. Toque num chip acima pra afrouxar.</p>
  {/if}

  <div class="cards mt-2">
    {#each ofertas as o (o.id)}
      <article class="card" class:match={o.match}>
        <div class="ctop">
          <div class="min-w-0">
            <div class="dest">
              {flag(o.pais_iso2)}
              {o.destino_texto}
              {#if o.match}<span class="heart">💛</span>
              {:else}
                {#if curte(o, pessoas[0]?.id)}<span class="pd sm" style="background:#38BDF8"></span>{/if}
                {#if curte(o, pessoas[1]?.id)}<span class="pd sm" style="background:#F472B6"></span>{/if}
              {/if}
            </div>
            <div class="sub">
              São Paulo → {o.destino_texto}
              {#if o.escalas === 0}<span class="text-ambar">· direto</span>
              {:else if o.escalas}· {o.escalas} escala{o.escalas > 1 ? 's' : ''}{/if}
              {#if o.companhia} · {o.companhia}{/if}
            </div>
          </div>
          <div class="pr">
            <div class="price">{brl(o.preco_brl * (o.por_pessoa ? viajantes : 1))}</div>
            <div class="pp">{o.por_pessoa && viajantes > 1 ? `p/ ${viajantes}` : 'por pessoa'}</div>
          </div>
        </div>

        {#if o.tipos?.length}
          <div class="tags">
            {#each o.tipos.slice(0, 3) as t}<span class="tag">{TIPO_LABEL[t]}</span>{/each}
          </div>
        {/if}

        {#if o.baseline?.tem_baseline}
          <p class="base {o.baseline.desvio_pct < 0 ? 'low' : 'mid'}">
            {#if o.baseline.raro}🔥 {/if}📊
            {o.baseline.desvio_pct < 0 ? `${Math.abs(o.baseline.desvio_pct)}% abaixo` : `${o.baseline.desvio_pct}% acima`}
            da média de 90 dias
          </p>
        {:else if o.insight}
          <p class="base {o.insight.nivel === 'low' ? 'low' : 'mid'}">
            📊 {o.insight.nivel === 'low' ? '🟢 preço baixo' : o.insight.nivel === 'high' ? '🔴 preço alto' : '🟡 preço típico'} segundo o Google
          </p>
        {:else}
          <p class="base dim">📊 sem baseline ainda ({o.baseline?.amostras ?? 0}/{o.baseline?.precisa ?? 7} dias)</p>
        {/if}

        {#if o.janela}<p class="win">{janelaCurta(o.janela)}{o.noites ? ` · ${o.noites} noites` : ''}</p>{/if}
        {#if o.visto && o.visto.exige !== 'NAO'}
          <p class="visto">🛂 exige visto/autorização — confira antes de comprar</p>
        {:else if o.sem_visto === true}
          <p class="visto ok">✓ sem visto pra brasileiro</p>
        {/if}
        {#if o.bagagem_despachada === 'inclui'}<p class="bag">✓ com bagagem despachada</p>{/if}
        {#if o.flags?.length}<p class="warn">⚠ {o.flags.join(', ')} — confira</p>{/if}

        <div class="actions">
          <a class="src" href={o.fontes[0].link} target="_blank" rel="noopener">
            {nomeFonte(o.fontes[0].nome)} ↗{#if o.fontes.length > 1} · {o.fontes.length} fontes{/if}
          </a>
          <button class="fav" class:on={local.favoritos.includes(o.id)} onclick={() => favoritar(o.id)}>★</button>
          <button class="hide" onclick={() => descartar(o.id)}>ocultar</button>
        </div>
      </article>
    {/each}
  </div>

  {#if favoritas.length}
    <div class="favbar">★ {favoritas.length} favorita{favoritas.length > 1 ? 's' : ''} salva{favoritas.length > 1 ? 's' : ''} neste aparelho</div>
  {/if}
{/if}

<!-- gaveta de filtros -->
<div class="scrim" class:open={sheet} onclick={() => (sheet = false)} aria-hidden="true"></div>
<div class="sheet" class:open={sheet}>
  <div class="handle"></div>
  <h3>Filtrar oportunidades</h3>
  <div class="segs">
    {#each [['tipo', 'Tipo'], ['lugar', 'Lugar'], ['preco', 'Preço'], ['extras', 'Extras']] as [s, l]}
      <button class:on={seg === s} onclick={() => (seg = s)}>{l}</button>
    {/each}
  </div>

  <div class="pane">
    {#if seg === 'tipo'}
      <div class="tgrid">
        {#each TIPOS as [k, em, lbl]}
          <button class="tchip" class:on={tipos.has(k)} onclick={() => (tipos = toggleSet(tipos, k))}>
            <span class="em">{em}</span>{lbl}<span class="ck"></span>
          </button>
        {/each}
      </div>
    {:else if seg === 'lugar'}
      <div class="conts">
        {#each CONTINENTES as [id, nome]}
          {#if paisesPorCont[id]}
            <div class="cont" class:open={contAberto.has(id)}>
              <button class="chead" onclick={() => (contAberto = toggleSet(contAberto, id))}>
                {nome}<span class="chev">›</span>
              </button>
              {#if contAberto.has(id)}
                <div class="ccys">
                  {#each [...paisesPorCont[id].keys()] as iso}
                    <button class="ccy" class:on={paises.has(iso)} onclick={() => (paises = toggleSet(paises, iso))}>
                      {flag(iso)} {iso}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    {:else if seg === 'preco'}
      <div class="rng">
        <div class="rv">até {brl(precoMax)} <small>por pessoa, ida e volta</small></div>
        <input type="range" min="800" max="8000" step="100" bind:value={precoMax} />
      </div>
    {:else}
      <div class="extras">
        <label class="ex">
          <div><div class="l">Só sem visto pra brasileiro</div><div class="d">Derivado do dataset consular; a pegadinha sempre aparece no card</div></div>
          <input type="checkbox" bind:checked={extra.visto} />
        </label>
        <label class="ex">
          <div><div class="l">Só o que agrada os dois 💛</div><div class="d">Esconde o que só um de vocês curtiria</div></div>
          <input type="checkbox" bind:checked={extra.match} />
        </label>
        <label class="ex">
          <div><div class="l">Só abaixo da média de 90 dias</div><div class="d">Precisa de 7+ dias de série</div></div>
          <input type="checkbox" bind:checked={extra.deal} />
        </label>
        <label class="ex">
          <div><div class="l">Só voo direto</div><div class="d">Sem conexão</div></div>
          <input type="checkbox" bind:checked={extra.direto} />
        </label>
      </div>
    {/if}
  </div>

  <button class="apply" onclick={() => (sheet = false)}>Ver {contagem} oportunidades</button>
</div>

<style>
  .mark {
    width: 24px; height: 24px; border-radius: 7px; flex: none;
    border: 1.5px solid #F5A524;
    background: radial-gradient(circle at 50% 50%, transparent 22%, #F5A524 24%, #F5A524 30%, transparent 32%, transparent 44%, #F5A524 46%, #F5A524 50%, transparent 52%), #0b1220;
  }
  .people { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; background: #0e192a; border: 1px solid #22304A; border-radius: 13px; padding: 4px; }
  .people button { border: 0; background: transparent; color: #8A9BB8; font: inherit; font-size: 13px; font-weight: 600; padding: 8px 4px; border-radius: 9px; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
  .people button .pd { width: 8px; height: 8px; border-radius: 50%; }
  .people button.on { background: #22324e; color: #EAF0FA; }
  .people button.nos.on { background: linear-gradient(180deg,#3a2f14,#2a2210); color: #F5A524; }

  .fbar { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: none; }
  .fbar::-webkit-scrollbar { display: none; }
  .fbtn { flex: none; border: 1px solid #22304A; background: #1B2942; color: #EAF0FA; font: inherit; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 999px; cursor: pointer; white-space: nowrap; }
  .fbtn.primary { background: #F5A524; color: #14161c; border-color: #F5A524; }
  .fchip { flex: none; display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 600; background: #10203a; border: 1px solid #2f4a70; border-radius: 999px; padding: 6px 6px 6px 12px; white-space: nowrap; }
  .fchip .x { border: 0; background: transparent; color: #8A9BB8; font-size: 16px; line-height: 1; cursor: pointer; padding: 0 3px; }

  .countline { font-size: 12px; color: #8A9BB8; }
  .cards { display: flex; flex-direction: column; gap: 11px; }
  .card { background: #131C2E; border: 1px solid #22304A; border-radius: 16px; padding: 14px; }
  .card.match { border-color: #4a3a17; }
  .ctop { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .dest { font-size: 15px; font-weight: 650; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .dest .pd.sm { width: 8px; height: 8px; border-radius: 50%; }
  .heart { font-size: 14px; filter: drop-shadow(0 0 6px #f5a52466); }
  .sub { font-size: 11.5px; color: #8A9BB8; margin-top: 3px; }
  .pr { text-align: right; flex: none; }
  .price { font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .pp { font-size: 10px; color: #8A9BB8; }
  .tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 10px; }
  .tag { font-size: 11px; background: #17263f; border: 1px solid #26395a; padding: 3px 9px; border-radius: 999px; }
  .base { font-size: 11.5px; margin-top: 9px; }
  .base.low { color: #F5A524; }
  .base.mid { color: #8A9BB8; }
  .base.dim { color: #6b7d9c; }
  .win { font-size: 11.5px; color: #8A9BB8; margin-top: 6px; }
  .visto { font-size: 11.5px; color: #F5A524; margin-top: 6px; }
  .visto.ok { color: #4ADE80; }
  .bag { font-size: 11.5px; color: #4ADE80; margin-top: 5px; }
  .warn { font-size: 11.5px; color: #eab308; margin-top: 5px; }
  .actions { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
  .src { font-size: 12px; background: rgba(34,48,74,.6); padding: 7px 12px; border-radius: 9px; text-decoration: none; color: inherit; }
  .fav { border: 0; background: rgba(34,48,74,.6); color: inherit; font-size: 12px; padding: 7px 12px; border-radius: 9px; cursor: pointer; }
  .fav.on { background: #F5A524; color: #14161c; }
  .hide { margin-left: auto; border: 0; background: rgba(34,48,74,.4); color: #8A9BB8; font: inherit; font-size: 12px; padding: 7px 12px; border-radius: 9px; cursor: pointer; }
  .favbar { margin-top: 18px; font-size: 12px; color: #8A9BB8; }

  .scrim { position: fixed; inset: 0; background: rgba(3,6,12,.55); opacity: 0; pointer-events: none; transition: opacity .25s; z-index: 40; }
  .scrim.open { opacity: 1; pointer-events: auto; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 50; margin: 0 auto; max-width: 42rem;
    background: #101a2c; border: 1px solid #22304A; border-bottom: 0; border-radius: 22px 22px 0 0;
    padding: 8px 18px calc(18px + env(safe-area-inset-bottom)); transform: translateY(105%);
    transition: transform .3s cubic-bezier(.2,.8,.2,1); max-height: 88vh; display: flex; flex-direction: column; }
  .sheet.open { transform: translateY(0); }
  .handle { width: 40px; height: 4px; border-radius: 3px; background: #34486a; margin: 6px auto 12px; }
  .sheet h3 { font-size: 16px; font-weight: 680; }
  .segs { display: flex; gap: 6px; margin: 14px 0 6px; background: #0c1626; padding: 4px; border-radius: 12px; }
  .segs button { flex: 1; border: 0; background: transparent; color: #8A9BB8; font: inherit; font-size: 12.5px; font-weight: 600; padding: 8px 4px; border-radius: 9px; cursor: pointer; }
  .segs button.on { background: #22324e; color: #EAF0FA; }
  .pane { overflow-y: auto; padding: 8px 2px; min-height: 180px; }
  .tgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tchip { display: flex; align-items: center; gap: 9px; background: #131C2E; border: 1px solid #22304A; border-radius: 12px; padding: 12px; font: inherit; font-size: 13.5px; font-weight: 600; color: #EAF0FA; cursor: pointer; }
  .tchip .em { font-size: 17px; }
  .tchip .ck { margin-left: auto; width: 18px; height: 18px; border-radius: 6px; border: 1.5px solid #3a4f72; position: relative; }
  .tchip.on { border-color: #F5A524; background: #1d2740; }
  .tchip.on .ck { background: #F5A524; border-color: #F5A524; }
  .tchip.on .ck::after { content: '✓'; color: #14161c; font-size: 12px; font-weight: 800; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .conts { display: flex; flex-direction: column; gap: 7px; }
  .cont { background: #131C2E; border: 1px solid #22304A; border-radius: 12px; overflow: hidden; }
  .chead { width: 100%; display: flex; align-items: center; justify-content: space-between; border: 0; background: transparent; color: inherit; font: inherit; font-size: 13.5px; font-weight: 600; padding: 12px 14px; cursor: pointer; }
  .chead .chev { color: #8A9BB8; transition: transform .2s; }
  .cont.open .chead .chev { transform: rotate(90deg); }
  .ccys { display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 12px 12px; }
  .ccy { border: 1px solid #26395a; background: #17263f; color: #EAF0FA; font: inherit; font-size: 12px; font-weight: 600; padding: 6px 11px; border-radius: 999px; cursor: pointer; }
  .ccy.on { background: #F5A524; color: #14161c; border-color: #F5A524; }
  .rng { padding: 20px 6px; }
  .rv { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .rv small { font-size: 12px; color: #8A9BB8; font-weight: 500; }
  .rng input { width: 100%; margin-top: 14px; accent-color: #F5A524; }
  .extras { display: flex; flex-direction: column; }
  .ex { display: flex; align-items: center; gap: 12px; padding: 13px 4px; border-bottom: 1px solid #1b2a44; cursor: pointer; }
  .ex:last-child { border-bottom: 0; }
  .ex .l { font-size: 13.5px; font-weight: 600; }
  .ex .d { font-size: 11.5px; color: #8A9BB8; margin-top: 2px; }
  .ex div:first-child { flex: 1; }
  .ex input { width: 20px; height: 20px; accent-color: #F5A524; flex: none; }
  .apply { margin-top: 12px; border: 0; background: #F5A524; color: #14161c; font: inherit; font-size: 15px; font-weight: 700; padding: 15px; border-radius: 13px; cursor: pointer; }
</style>
