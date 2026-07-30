<script>
  import { onMount } from 'svelte';
  import { carregar, brl, quando, janelaCurta, lerEstado, gravarEstado } from '$lib/dados.js';
  import { TIPOS, TIPO_LABEL, flag } from '$lib/filtros.js';

  const FONTE_NOME = {
    'melhores-destinos': 'Melhores Destinos', 'google-explore': 'Google Flights',
    'tg:melhoresdestinos': 'Melhores Destinos', 'tg:passageirodeprimeira': 'Passageiro de Primeira',
    'tg:canalpontospravoar': 'Pontos pra Voar', 'tg:promopassagens': 'PromoPassagens',
  };
  const nomeFonte = (n) => FONTE_NOME[n] || (n?.startsWith('tg:') ? n.slice(3) : n || 'fonte');

  let estado = $state({ carregando: true, erro: null, dados: null });
  let local = $state(lerEstado());
  let onboarding = $state(false);
  let passo = $state(1);
  let rascunho = $state({ nome1: '', nome2: '', cidade: '' });
  let gostoSheet = $state(false);
  let editando = $state('p1');
  let aba = $state('inicio');
  let mostrarTodas = $state(false);
  let precoMax = $state(5000);
  let filtro = $state('todos');
  let regras = $derived(estado.dados?.perfis?.[0] ?? {});

  onMount(async () => {
    local = lerEstado();
    rascunho = {
      nome1: local.casal?.pessoas?.[0]?.nome ?? '',
      nome2: local.casal?.pessoas?.[1]?.nome ?? '',
      cidade: local.casal?.cidade ?? '',
    };
    onboarding = !local.casal?.completo;
    try { estado.dados = await carregar(); }
    catch (e) { estado.erro = e.message; }
    estado.carregando = false;
  });

  let pessoas = $derived(local.casal?.pessoas ?? []);
  let nomes = $derived(pessoas.map((p) => p.nome).filter(Boolean));
  let saudacao = $derived(nomes.length === 2 ? `${nomes[0]} e ${nomes[1]}` : 'vocês dois');
  const gostoDe = (id) => local.gosto?.[id] ?? [];
  const configurado = (id) => gostoDe(id).length > 0;
  let todosConfigurados = $derived(pessoas.length === 2 && pessoas.every((p) => configurado(p.id)));
  const curte = (o, id) => (o.tipos || []).some((t) => gostoDe(id).includes(t));
  const ehMatch = (o) => todosConfigurados && pessoas.every((p) => curte(o, p.id));
  const ehDeal = (o) => o.baseline?.raro || (o.baseline?.tem_baseline && o.baseline.desvio_pct < 0) || o.insight?.nivel === 'low';

  let ofertas = $derived.by(() => {
    const visiveis = (estado.dados?.ofertas ?? []).filter((o) => {
      if (local.descartados.includes(o.id)) return false;
      if (o.origem_metro && o.origem_metro !== 'SAO') return false;
      if (/^BR$/i.test(o.pais_iso2 || '') || /^brasil$/i.test(o.pais_texto || '')) return false;
      if (regras.tipos?.length && !regras.tipos.includes(o.tipo)) return false;
      if (o.noites != null && regras.noites && (o.noites < regras.noites.min || o.noites > regras.noites.max)) return false;
      if (o.preco_brl > precoMax) return false;
      if (filtro === 'match' && !ehMatch(o)) return false;
      if (filtro === 'sem-visto' && o.sem_visto !== true) return false;
      if (filtro === 'direto' && o.escalas !== 0) return false;
      return true;
    });
    const grupos = new Map();
    for (const o of visiveis) {
      const k = o.destino_metro || o.destino_texto;
      const atual = grupos.get(k);
      if (!atual) grupos.set(k, { ...o, _alternativas: [] });
      else if (o.preco_brl < atual.preco_brl) grupos.set(k, { ...o, _alternativas: [atual, ...(atual._alternativas ?? [])] });
      else atual._alternativas.push(o);
    }
    return [...grupos.values()].sort((a, b) =>
      (ehMatch(b) ? 5000 : 0) - (ehMatch(a) ? 5000 : 0) ||
      (ehDeal(b) ? 1000 : 0) - (ehDeal(a) ? 1000 : 0) || a.preco_brl - b.preco_brl
    );
  });

  let destaque = $derived(ofertas[0]);
  let lista = $derived(mostrarTodas ? ofertas : ofertas.slice(0, 6));
  let matches = $derived(ofertas.filter(ehMatch).length);
  let escapadas = $derived((estado.dados?.escapadas ?? []).map((e) => ({ ...e, match: todosConfigurados && pessoas.every((p) => e.tags.some((t) => gostoDe(p.id).includes(t))) })));

  function salvarCasal() {
    const nome1 = rascunho.nome1.trim(); const nome2 = rascunho.nome2.trim(); const cidade = rascunho.cidade.trim();
    if (!nome1 || !nome2 || !cidade) return;
    const gostosAntigos = Object.values(local.gosto ?? {}).filter((g) => Array.isArray(g) && g.length);
    const gosto = local.gosto?.p1 || local.gosto?.p2
      ? local.gosto
      : { ...local.gosto, p1: gostosAntigos[0] ?? [], p2: gostosAntigos[1] ?? [] };
    local = { ...local, gosto, casal: { completo: true, cidade, pessoas: [
      { id: 'p1', nome: nome1, cor: '#38BDF8' }, { id: 'p2', nome: nome2, cor: '#F472B6' },
    ] } };
    gravarEstado(local); onboarding = false; editando = 'p1'; gostoSheet = true;
  }
  function toggleGosto(id, tipo) {
    const atual = gostoDe(id);
    local = { ...local, gosto: { ...local.gosto, [id]: atual.includes(tipo) ? atual.filter((t) => t !== tipo) : [...atual, tipo] } };
    gravarEstado(local);
  }
  function favoritar(id) {
    const atual = local.favoritos.includes(id) ? local.favoritos.filter((x) => x !== id) : [...local.favoritos, id];
    local = { ...local, favoritos: atual }; gravarEstado(local);
  }
  function descartar(id) { local = { ...local, descartados: [...local.descartados, id] }; gravarEstado(local); }
  function acompanharEscapada(id) {
    const atual = local.escapadasFavoritas.includes(id)
      ? local.escapadasFavoritas.filter((x) => x !== id)
      : [...local.escapadasFavoritas, id];
    local = { ...local, escapadasFavoritas: atual }; gravarEstado(local);
  }
  function editarCasal() {
    rascunho = { nome1: pessoas[0]?.nome ?? '', nome2: pessoas[1]?.nome ?? '', cidade: local.casal?.cidade ?? '' };
    passo = 1; onboarding = true;
  }
  const fundoEscapada = (e) => e.imagem
    ? `linear-gradient(180deg,rgba(7,16,28,.08),rgba(7,16,28,.9)),url("${e.imagem}")`
    : 'linear-gradient(135deg,#263d4b,#171d31)';
</script>

<svelte:head>
  <title>Viagem para Dois — achados para escapar juntos</title>
  <meta name="description" content="Achados de viagens e escapadas escolhidos para vocês dois." />
</svelte:head>

<header class="topbar">
  <button class="brand" onclick={() => (aba = 'inicio')} aria-label="Ir para o início">
    <span class="brandmark"><i></i><b></b></span>
    <span><strong>Viagem para Dois</strong><small>Achados para escapar juntos.</small></span>
  </button>
  {#if local.casal?.completo}
    <button class="couple" onclick={editarCasal} aria-label="Editar a dupla">
      <span class="avatars"><i>{pessoas[0]?.nome?.[0]}</i><i>{pessoas[1]?.nome?.[0]}</i></span>
      <span>{saudacao}<small>{local.casal.cidade}</small></span>
    </button>
  {/if}
</header>

{#if estado.carregando}
  <main class="loading"><span></span><p>Procurando bons motivos para vocês escaparem…</p></main>
{:else if estado.erro}
  <main class="empty"><b>Não conseguimos atualizar os achados agora.</b><p>{estado.erro}</p></main>
{:else}
  <nav class="tabs" aria-label="Seções do aplicativo">
    <button class:on={aba === 'inicio'} onclick={() => (aba = 'inicio')}>Para vocês</button>
    <button class:on={aba === 'escapadas'} onclick={() => (aba = 'escapadas')}>Escapadas</button>
    <button class:on={aba === 'viagens'} onclick={() => (aba = 'viagens')}>Viagens</button>
    <button class:on={aba === 'salvos'} onclick={() => (aba = 'salvos')}>Salvos <em>{local.favoritos.length + local.escapadasFavoritas.length}</em></button>
  </nav>

  {#if aba === 'inicio'}
    <main>
      <section class="hello">
        <p class="eyebrow">CURADORIA DE HOJE</p>
        <h1>Que tal escapar,<br /><span>{saudacao}?</span></h1>
        <p>Selecionamos oportunidades que cabem na rotina, no bolso e no gosto de vocês.</p>
      </section>

      {#if !todosConfigurados}
        <button class="tastecall" onclick={() => { editando = pessoas.find((p) => !configurado(p.id))?.id ?? 'p1'; gostoSheet = true; }}>
          <span>💛</span><div><b>Ensinem o app a escolher melhor</b><small>{pessoas.filter((p) => !configurado(p.id)).map((p) => p.nome).join(' e ')} ainda precisa marcar seus gostos.</small></div><i>›</i>
        </button>
      {/if}

      <section class="sectionhead"><div><span>✦</span><p>O melhor achado para vocês</p></div><small>atualizado {quando(estado.dados.gerado_em)}</small></section>
      {#if destaque}
        <article class="heroDeal">
          <div class="heroVisual"><span>{flag(destaque.pais_iso2)}</span><div class="orb one"></div><div class="orb two"></div><small>{ehMatch(destaque) ? '💛 combina com os dois' : ehDeal(destaque) ? '↓ preço fora da curva' : '✈ oportunidade no radar'}</small></div>
          <div class="heroBody">
            <div><p class="eyebrow">{destaque.continente?.replaceAll('_',' ') ?? 'VIAGEM'}</p><h2>{destaque.destino_texto}</h2><p class="route">São Paulo → {destaque.destino_texto}{destaque.escalas === 0 ? ' · direto' : destaque.escalas ? ` · ${destaque.escalas} escala${destaque.escalas > 1 ? 's' : ''}` : ''}</p></div>
            <div class="bigprice"><small>a partir de</small><strong>{brl(destaque.preco_brl * (destaque.por_pessoa ? 2 : 1))}</strong><span>para duas pessoas</span></div>
            <div class="why"><b>Por que vale olhar</b><p>{ehMatch(destaque) ? `Vocês dois marcaram interesse em ${destaque.tipos.slice(0,2).map((t)=>TIPO_LABEL[t]).join(' e ')}.` : ehDeal(destaque) && destaque.baseline?.desvio_pct ? `Está ${Math.abs(destaque.baseline.desvio_pct)}% abaixo da média recente.` : 'É uma das melhores combinações de preço e viagem no radar.'}</p></div>
            <div class="meta">{#if destaque.janela}<span>🗓 {janelaCurta(destaque.janela)}</span>{/if}{#if destaque.sem_visto}<span>✓ sem visto</span>{/if}</div>
            <div class="dealActions"><a href={destaque.fontes[0].link} target="_blank" rel="noopener">Ver oportunidade ↗</a><button class:on={local.favoritos.includes(destaque.id)} onclick={() => favoritar(destaque.id)} aria-label="Salvar oportunidade">★</button></div>
          </div>
        </article>
      {/if}

      <section class="sectionhead space"><div><span>☾</span><p>Escapadas sem complicação</p></div><button onclick={() => (aba = 'escapadas')}>Ver todas</button></section>
      <div class="escapeRail">
        {#each escapadas.slice(0,3) as e}
          <article class="escape" style={`--escape-bg:${fundoEscapada(e)}`}><div class="escapeTop"><span>{e.icone}</span><small>{e.avaliacao ? `★ ${e.avaliacao}` : e.tipo}</small></div><div><p>{e.tipo}</p><h3>{e.destino}</h3><span>{e.noites} noite{e.noites > 1 ? 's' : ''} · {e.distancia}</span></div><footer><b>{brl(e.preco_total)}</b><small>para dois · datas selecionadas</small></footer></article>
        {/each}
      </div>

      <section class="sectionhead space"><div><span>↗</span><p>Mais oportunidades no radar</p></div><button onclick={() => (aba = 'viagens')}>Explorar</button></section>
      <div class="compactGrid">
        {#each ofertas.slice(1,5) as o}<button onclick={() => (aba = 'viagens')}><span>{flag(o.pais_iso2)}</span><div><b>{o.destino_texto}</b><small>{o.escalas === 0 ? 'voo direto' : o.companhia ?? 'oportunidade aérea'}</small></div><strong>{brl(o.preco_brl * (o.por_pessoa ? 2 : 1))}</strong></button>{/each}
      </div>
    </main>
  {:else if aba === 'escapadas'}
    <main><section class="pageintro"><p class="eyebrow">PERTO DE {local.casal.cidade.toUpperCase()}</p><h1>Uma pausa cabe<br />neste fim de semana.</h1><p>Bate e volta, uma noite especial ou um hotel na própria cidade — ideias para vocês saírem do automático.</p></section>
      <div class="notice">✦ Disponibilidade consultada no Google Hotels {quando(estado.dados.escapadas_meta?.gerado_em)}. O preço final é confirmado no fornecedor.</div>
      {#if escapadas.length}<div class="escapeList">{#each escapadas as e}<article><div class="escapeArt" style={`--escape-bg:${fundoEscapada(e)}`}><span>{e.icone}</span><small>{e.match ? '💛 combina com os dois' : e.avaliacao ? `★ ${e.avaliacao}` : e.tipo}</small></div><div class="escapeInfo"><p>{e.tipo} · {e.distancia}</p><h2>{e.nome}</h2><p>{e.descricao}</p><div class="tags">{#each e.tags as t}<span>{TIPO_LABEL[t]}</span>{/each}{#each e.comodidades?.slice(0,2) ?? [] as a}<span>{a}</span>{/each}</div><footer><div><small>{e.checkin} → {e.checkout} · para dois</small><b>{brl(e.preco_total)}</b></div><div class="escapeActions"><a href={e.link} target="_blank" rel="noopener">Ver ↗</a><button class:on={local.escapadasFavoritas.includes(e.id)} onclick={() => acompanharEscapada(e.id)}>{local.escapadasFavoritas.includes(e.id) ? 'Salvo ✓' : 'Acompanhar'}</button></div></footer></div></article>{/each}</div>{:else}<div class="empty"><b>As escapadas estão sendo atualizadas.</b><p>As viagens continuam disponíveis enquanto consultamos os hotéis do próximo fim de semana.</p></div>{/if}
    </main>
  {:else if aba === 'viagens'}
    <main><section class="pageintro slim"><p class="eyebrow">RADAR DE OPORTUNIDADES</p><h1>Viajar bem começa<br />por encontrar a hora certa.</h1></section>
      <div class="filters"><div>{#each [['todos','Todos'],['match','💛 Os dois'],['sem-visto','Sem visto'],['direto','Direto']] as [id,n]}<button class:on={filtro===id} onclick={() => (filtro=id)}>{n}</button>{/each}</div><label>Até {brl(precoMax)} por pessoa<input type="range" min="1500" max="8000" step="500" bind:value={precoMax} /></label></div>
      <p class="results">{ofertas.length} destinos no radar · preços para duas pessoas</p>
      <div class="travelGrid">{#each lista as o (o.id)}<article class:match={ehMatch(o)}><header><span>{flag(o.pais_iso2)}</span><div><h2>{o.destino_texto}</h2><p>São Paulo → {o.destino_texto}</p></div><button class:on={local.favoritos.includes(o.id)} onclick={() => favoritar(o.id)} aria-label={`Salvar ${o.destino_texto}`}>★</button></header><div class="tags">{#each o.tipos?.slice(0,3) ?? [] as t}<span>{TIPO_LABEL[t]}</span>{/each}</div>{#if ehMatch(o)}<p class="signal match">💛 agrada os dois</p>{:else if o.baseline?.tem_baseline}<p class="signal">📊 {Math.abs(o.baseline.desvio_pct)}% {o.baseline.desvio_pct < 0 ? 'abaixo' : 'acima'} da média</p>{/if}<div class="triprow"><div>{#if o.janela}<span>{janelaCurta(o.janela)} · {o.noites ?? '?'} noites</span>{/if}<small>{o.escalas === 0 ? 'voo direto' : o.escalas ? `${o.escalas} escala${o.escalas>1?'s':''}` : ''} {o.companhia ? `· ${o.companhia}` : ''}</small></div><strong>{brl(o.preco_brl * (o.por_pessoa ? 2 : 1))}<small>para dois</small></strong></div><footer><a href={o.fontes[0].link} target="_blank" rel="noopener">{nomeFonte(o.fontes[0].nome)} ↗</a><button onclick={() => descartar(o.id)}>Não mostrar</button></footer></article>{/each}</div>
      {#if ofertas.length > 5}<button class="more" onclick={() => (mostrarTodas = !mostrarTodas)}>{mostrarTodas ? 'Mostrar seleção' : `Ver todos os ${ofertas.length} destinos`}</button>{/if}
    </main>
  {:else}
    <main><section class="pageintro slim"><p class="eyebrow">ESCOLHIDOS POR VOCÊS</p><h1>Planos que merecem<br />uma segunda olhada.</h1></section>
      {#if !local.favoritos.length && !local.escapadasFavoritas.length}<div class="empty"><b>Nenhum plano salvo ainda.</b><p>Salvem viagens e escapadas para conversar depois.</p><button onclick={() => (aba='viagens')}>Explorar viagens</button></div>{:else}<div class="travelGrid">{#each (estado.dados.ofertas ?? []).filter((o)=>local.favoritos.includes(o.id)) as o}<article><header><span>{flag(o.pais_iso2)}</span><div><h2>{o.destino_texto}</h2><p>{o.companhia ?? 'Oportunidade salva'}</p></div><button class="on" onclick={() => favoritar(o.id)}>★</button></header><div class="triprow"><span>{o.janela ? janelaCurta(o.janela) : 'Datas na fonte'}</span><strong>{brl(o.preco_brl * (o.por_pessoa ? 2 : 1))}</strong></div></article>{/each}{#each escapadas.filter((e)=>local.escapadasFavoritas.includes(e.id)) as e}<article><header><span>{e.icone}</span><div><h2>{e.nome}</h2><p>{e.destino} · escapada salva</p></div><button class="on" onclick={() => acompanharEscapada(e.id)}>★</button></header><div class="triprow"><span>{e.checkin} → {e.checkout}</span><strong>{brl(e.preco_total)}</strong></div></article>{/each}</div>{/if}
    </main>
  {/if}
{/if}

{#if onboarding}
  <div class="modalback"></div><div class="onboarding" role="dialog" aria-modal="true" aria-label="Criar espaço da dupla"><div class="onbrand"><span class="brandmark"><i></i><b></b></span><small>VIAGEM PARA DOIS</small></div><div class="progress"><i class:on={passo>=1}></i><i class:on={passo>=2}></i></div>
    {#if passo === 1}<p class="eyebrow">PRIMEIRO, VOCÊS</p><h2>Como podemos chamar<br />cada um de vocês?</h2><p class="lead">Cada pessoa terá seus próprios gostos. O app encontra o que combina com os dois.</p><label>Seu nome<input placeholder="Ex.: Ana" bind:value={rascunho.nome1} autocomplete="given-name" /></label><label>Nome da outra pessoa<input placeholder="Ex.: Julia" bind:value={rascunho.nome2} /></label><button class="continue" disabled={!rascunho.nome1.trim() || !rascunho.nome2.trim()} onclick={() => (passo=2)}>Continuar <span>→</span></button>
    {:else}<p class="eyebrow">DE ONDE VOCÊS PARTEM?</p><h2>Onde começam as<br />escapadas de vocês?</h2><p class="lead">O lançamento começa em São Paulo e arredores. Outras cidades serão abertas quando tivermos cobertura confiável.</p><label>Cidade-base<select bind:value={rascunho.cidade}><option value="">Selecione</option><option value="São Paulo">São Paulo</option></select></label><div class="privacy">⌂ Fica somente neste aparelho nesta versão.</div><button class="continue" disabled={!rascunho.cidade.trim()} onclick={salvarCasal}>Criar nosso espaço <span>→</span></button><button class="back" onclick={() => (passo=1)}>Voltar</button>{/if}
  </div>
{/if}

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="scrim" class:open={gostoSheet} onclick={() => (gostoSheet=false)}></div><section class="sheet" class:open={gostoSheet}><div class="handle"></div><p class="eyebrow">PREFERÊNCIAS DA DUPLA</p><h2>O que faz uma viagem valer a pena?</h2><p>Marquem separadamente. Não existe resposta errada — só viagens mais certeiras.</p><div class="personseg">{#each pessoas as p}<button class:on={editando===p.id} onclick={() => (editando=p.id)}><i style={`background:${p.cor}`}></i>{p.nome}{configurado(p.id)?' ✓':''}</button>{/each}</div><div class="tastegrid">{#each TIPOS as [k,em,lbl]}<button class:on={gostoDe(editando).includes(k)} onclick={() => toggleGosto(editando,k)}><span>{em}</span>{lbl}<i>✓</i></button>{/each}</div><button class="continue" onclick={() => { const outro=pessoas.find((p)=>p.id!==editando && !configurado(p.id)); if(outro) editando=outro.id; else gostoSheet=false; }}>{pessoas.some((p)=>p.id!==editando&&!configurado(p.id))?'Agora a outra pessoa →':'Pronto — ver nossos achados'}</button></section>

<style>
  :global(body){background:#07101c;color:#edf3fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif} button,a,input{font:inherit}.topbar{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #18263a}.brand{display:flex;align-items:center;gap:11px;background:none;border:0;color:inherit;text-align:left;cursor:pointer}.brand strong{display:block;font-size:15px;letter-spacing:-.02em}.brand small{display:block;color:#7f91aa;font-size:10px;margin-top:1px}.brandmark{width:31px;height:31px;border:1.5px solid #f5a524;border-radius:10px;position:relative;display:block}.brandmark i,.brandmark b{position:absolute;border:1.5px solid #f5a524;border-radius:50%;inset:6px}.brandmark b{inset:11px}.couple{display:flex;align-items:center;gap:10px;border:1px solid #203149;background:#101b2c;color:inherit;border-radius:12px;padding:6px 10px;cursor:pointer;text-align:left;font-size:12px}.couple small{display:block;color:#7f91aa;font-size:9px}.avatars{display:flex}.avatars i{width:25px;height:25px;border-radius:50%;background:#12354a;display:grid;place-items:center;font-style:normal;font-size:10px;border:2px solid #101b2c}.avatars i+ i{margin-left:-7px;background:#4a203b}.tabs{display:flex;gap:25px;border-bottom:1px solid #18263a;overflow:auto}.tabs button{padding:14px 2px 12px;border:0;border-bottom:2px solid transparent;background:none;color:#7589a4;font-size:12px;font-weight:650;white-space:nowrap;cursor:pointer}.tabs button.on{color:#f5a524;border-color:#f5a524}.tabs em{font-style:normal;background:#1b2a3f;padding:1px 5px;border-radius:9px;font-size:9px}main{padding-top:28px}.hello{padding:22px 0 25px}.eyebrow{color:#f5a524;font-size:10px;letter-spacing:.18em;font-weight:800;text-transform:uppercase}.hello h1,.pageintro h1{font-family:Georgia,serif;font-size:clamp(38px,7vw,67px);line-height:.98;font-weight:500;letter-spacing:-.045em;margin:10px 0 15px}.hello h1 span{color:#f5a524;font-style:italic}.hello>p:last-child,.pageintro>p:last-child{color:#8798af;font-size:14px;max-width:500px;line-height:1.6}.tastecall{width:100%;display:flex;align-items:center;gap:13px;padding:14px 16px;border:1px solid #4b3d1b;background:linear-gradient(100deg,#2b2412,#151b27);border-radius:15px;color:inherit;text-align:left;cursor:pointer}.tastecall>span{font-size:22px}.tastecall div{flex:1}.tastecall b,.tastecall small{display:block}.tastecall b{font-size:13px;color:#f5a524}.tastecall small{font-size:11px;color:#8798af;margin-top:2px}.tastecall i{font-size:20px;color:#f5a524}.sectionhead{display:flex;align-items:center;justify-content:space-between;margin:20px 0 11px}.sectionhead.space{margin-top:32px}.sectionhead div{display:flex;align-items:center;gap:8px}.sectionhead div>span{color:#f5a524}.sectionhead p{font-size:12px;font-weight:750;text-transform:uppercase;letter-spacing:.1em}.sectionhead small{font-size:10px;color:#687b95}.sectionhead button{border:0;background:none;color:#f5a524;font-size:11px;cursor:pointer}.heroDeal{display:grid;grid-template-columns:minmax(210px,.8fr) 1.2fr;border:1px solid #253550;border-radius:22px;overflow:hidden;background:#111b2c}.heroVisual{min-height:340px;background:radial-gradient(circle at 40% 40%,#384b5d 0 13%,transparent 14%),linear-gradient(145deg,#27403e,#171b31 65%,#282039);position:relative;display:grid;place-items:center;overflow:hidden}.heroVisual>span{font-size:75px;z-index:2;filter:drop-shadow(0 15px 25px #0008)}.heroVisual small{position:absolute;left:16px;bottom:15px;background:#07101ccc;border:1px solid #ffffff22;border-radius:99px;padding:6px 9px;font-size:10px}.orb{position:absolute;border-radius:50%;border:1px solid #ffffff18}.orb.one{width:230px;height:230px}.orb.two{width:320px;height:320px}.heroBody{padding:26px;display:grid;grid-template-columns:1fr auto;gap:18px}.heroBody h2{font-family:Georgia,serif;font-size:31px;font-weight:500;margin:4px 0}.route{font-size:11px;color:#8192aa}.bigprice{text-align:right}.bigprice>*{display:block}.bigprice small,.bigprice span{font-size:9px;color:#8192aa}.bigprice strong{font-size:23px;color:#f5a524}.why{grid-column:1/-1;border-left:2px solid #f5a524;padding-left:12px}.why b{font-size:11px;text-transform:uppercase;letter-spacing:.08em}.why p{font-size:12px;color:#91a1b7;margin-top:3px}.meta{display:flex;gap:12px;font-size:11px;color:#a6b4c7}.dealActions{display:flex;justify-content:flex-end;gap:7px}.dealActions a,.dealActions button{border:0;border-radius:10px;padding:9px 12px;text-decoration:none;background:#f5a524;color:#11151c;font-size:11px;font-weight:750}.dealActions button{background:#1c2a40;color:#fff}.dealActions button.on{color:#f5a524}.escapeRail{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.escape{min-height:205px;border:1px solid #263650;border-radius:17px;padding:14px;background:var(--escape-bg);display:flex;flex-direction:column;justify-content:space-between}.escapeTop{display:flex;justify-content:space-between}.escapeTop>span{font-size:25px}.escapeTop small{font-size:9px;background:#07101caa;padding:5px 7px;border-radius:99px}.escape p{font-size:9px;color:#f5a524;text-transform:uppercase;letter-spacing:.12em}.escape h3{font-family:Georgia,serif;font-size:23px;margin:2px 0}.escape div>span{font-size:10px;color:#c0cad7}.escape footer b,.escape footer small{display:block}.escape footer b{font-size:14px}.escape footer small{font-size:9px;color:#9baabd}.compactGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.compactGrid button{display:flex;align-items:center;gap:10px;border:1px solid #203149;background:#101a2a;color:inherit;border-radius:13px;padding:12px;text-align:left;cursor:pointer}.compactGrid button>span{font-size:20px}.compactGrid div{flex:1}.compactGrid b,.compactGrid small{display:block}.compactGrid b{font-size:12px}.compactGrid small{font-size:9px;color:#7f91aa}.compactGrid strong{font-size:11px;color:#f5a524}.pageintro{padding:35px 0 20px}.pageintro.slim{padding-bottom:25px}.notice{border:1px solid #3f351d;background:#211e13;color:#c8b781;padding:11px 13px;border-radius:12px;font-size:10px;margin-bottom:14px}.escapeList{display:grid;grid-template-columns:1fr 1fr;gap:12px}.escapeList article{background:#111b2c;border:1px solid #22334d;border-radius:18px;overflow:hidden}.escapeArt{height:145px;background:var(--escape-bg);display:flex;align-items:flex-start;justify-content:space-between;padding:14px}.escapeArt>span{font-size:36px}.escapeArt small{background:#07101cbb;border-radius:99px;padding:6px 8px;font-size:9px}.escapeInfo{padding:16px}.escapeInfo>p:first-child{font-size:9px;color:#f5a524;text-transform:uppercase;letter-spacing:.1em}.escapeInfo h2{font-family:Georgia,serif;font-size:26px;font-weight:500;margin:3px 0 6px}.escapeInfo>p{font-size:11px;color:#91a1b7;line-height:1.5}.tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}.tags span{font-size:9px;padding:4px 7px;border:1px solid #2b3d59;background:#17243a;border-radius:99px}.escapeInfo footer{display:flex;align-items:flex-end;justify-content:space-between;margin-top:14px}.escapeInfo footer small,.escapeInfo footer b{display:block}.escapeInfo footer small{font-size:8px;color:#7f91aa}.escapeInfo footer b{font-size:18px}.escapeInfo footer button{border:1px solid #4d3d18;background:#2b2412;color:#f5a524;border-radius:9px;padding:8px 10px;font-size:10px}.filters{display:flex;align-items:center;justify-content:space-between;gap:20px;border:1px solid #203149;background:#0d1726;border-radius:15px;padding:10px}.filters>div{display:flex;gap:5px;overflow:auto}.filters button{border:0;background:transparent;color:#7f91aa;border-radius:9px;padding:8px 10px;font-size:10px;white-space:nowrap}.filters button.on{background:#263650;color:#fff}.filters label{font-size:9px;color:#8da0b9;min-width:180px}.filters input{display:block;width:100%;accent-color:#f5a524;margin-top:4px}.results{font-size:10px;color:#6e829e;margin:13px 2px}.travelGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.travelGrid article{background:#111b2c;border:1px solid #22334d;border-radius:16px;padding:14px}.travelGrid article.match{border-color:#5a481d}.travelGrid header{display:flex;align-items:center;gap:10px}.travelGrid header>span{font-size:22px}.travelGrid header div{flex:1}.travelGrid h2{font-size:14px}.travelGrid header p{font-size:9px;color:#7f91aa}.travelGrid header button{border:0;background:#1b2a40;color:#8192a9;width:31px;height:31px;border-radius:9px}.travelGrid header button.on{color:#f5a524}.signal{font-size:10px;color:#f5a524;margin-top:9px}.signal.match{color:#ffca46}.triprow{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:10px}.triprow div span,.triprow div small{display:block;font-size:9px;color:#8294ab}.triprow strong{text-align:right;font-size:15px}.triprow strong small{display:block;font-size:8px;color:#7f91aa}.travelGrid footer{display:flex;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid #1c2b41}.travelGrid footer a,.travelGrid footer button{font-size:9px;color:#b8c4d3;background:none;border:0;text-decoration:none}.travelGrid footer button{color:#6f829d}.more{display:block;margin:18px auto;border:1px solid #2c405f;background:#142138;color:#d5deea;border-radius:11px;padding:10px 16px;font-size:11px}.empty{text-align:center;padding:60px 20px;color:#8192aa}.empty b{color:#edf3fb}.empty p{font-size:12px;margin:7px}.empty button{border:0;background:#f5a524;border-radius:9px;padding:9px 12px}.loading{display:grid;place-items:center;min-height:60vh}.loading span{width:28px;height:28px;border:2px solid #263650;border-top-color:#f5a524;border-radius:50%;animation:spin 1s linear infinite}.loading p{font-size:11px;color:#8294ab}.modalback,.scrim{position:fixed;inset:0;background:#050a12dd;z-index:60}.onboarding{position:fixed;z-index:70;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(440px,calc(100% - 28px));background:#101b2c;border:1px solid #293a55;border-radius:24px;padding:28px;box-shadow:0 30px 90px #000b}.onbrand{display:flex;align-items:center;gap:8px}.onbrand .brandmark{transform:scale(.75)}.onbrand small{font-size:9px;letter-spacing:.16em;color:#f5a524}.progress{display:flex;gap:5px;margin:25px 0}.progress i{height:3px;background:#273852;border-radius:3px;flex:1}.progress i.on{background:#f5a524}.onboarding h2,.sheet h2{font-family:Georgia,serif;font-size:31px;font-weight:500;line-height:1.05;margin:8px 0 10px}.lead,.sheet>p{font-size:11px;color:#8fa0b6;line-height:1.55;margin-bottom:18px}.onboarding label{display:block;font-size:10px;color:#95a5b9;margin-top:12px}.onboarding input{width:100%;box-sizing:border-box;margin-top:5px;border:1px solid #2a3c57;background:#0a1422;color:#fff;border-radius:11px;padding:12px;outline:none}.onboarding input:focus{border-color:#f5a524}.continue{width:100%;display:flex;justify-content:space-between;border:0;background:#f5a524;color:#11151c;border-radius:11px;padding:13px 15px;font-weight:750;font-size:12px;margin-top:18px}.continue:disabled{opacity:.35}.back{width:100%;border:0;background:none;color:#8496ae;font-size:10px;padding:10px}.privacy{font-size:10px;color:#71849d;margin-top:12px}.scrim{opacity:0;pointer-events:none;z-index:40;transition:.2s}.scrim.open{opacity:1;pointer-events:auto}.sheet{position:fixed;z-index:50;left:50%;bottom:0;transform:translate(-50%,105%);width:min(680px,100%);box-sizing:border-box;background:#101b2c;border:1px solid #293a55;border-radius:24px 24px 0 0;padding:10px 22px calc(22px + env(safe-area-inset-bottom));max-height:90vh;overflow:auto;transition:.3s}.sheet.open{transform:translate(-50%,0)}.handle{width:38px;height:4px;border-radius:5px;background:#344862;margin:0 auto 15px}.personseg{display:flex;background:#0a1422;padding:4px;border-radius:11px;margin-bottom:12px}.personseg button{flex:1;border:0;background:none;color:#8192aa;border-radius:8px;padding:9px}.personseg button.on{background:#233550;color:#fff}.personseg i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px}.tastegrid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.tastegrid button{display:flex;align-items:center;gap:8px;border:1px solid #293a55;background:#121f33;color:#dce5ef;border-radius:11px;padding:11px;text-align:left;font-size:11px}.tastegrid button>span{font-size:17px}.tastegrid button i{margin-left:auto;display:none}.tastegrid button.on{border-color:#f5a524;background:#292716}.tastegrid button.on i{display:block;color:#f5a524}@keyframes spin{to{transform:rotate(360deg)}}
  @media(max-width:700px){.topbar{height:60px}.brand small{display:none}.couple>span:last-child{display:none}.tabs{gap:18px}.heroDeal{grid-template-columns:1fr}.heroVisual{min-height:190px}.heroBody{padding:18px}.escapeRail{display:flex;overflow:auto;scroll-snap-type:x mandatory}.escape{min-width:230px;scroll-snap-align:start}.compactGrid,.escapeList,.travelGrid{grid-template-columns:1fr}.filters{align-items:stretch;flex-direction:column}.filters label{min-width:0}.hello h1,.pageintro h1{font-size:42px}.onboarding{padding:22px}.sheet h2{font-size:27px}}
  select{font:inherit;width:100%;box-sizing:border-box;margin-top:5px;border:1px solid #2a3c57;background:#0a1422;color:#fff;border-radius:11px;padding:12px;outline:none}
  .escapeActions{display:flex;gap:6px}.escapeActions a,.escapeActions button{border:1px solid #4d3d18;background:#2b2412;color:#f5a524;border-radius:9px;padding:8px 10px;font-size:10px;text-decoration:none}.escapeActions button.on{background:#f5a524;color:#11151c}.escapeArt,.escape{background-size:cover;background-position:center}
</style>
