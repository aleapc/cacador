// Alerta por Telegram.
//
// Um caçador que você precisa abrir não é um caçador — o valor todo está no
// "me avisa". Telegram em vez de push de PWA porque: push no iOS é frágil, as
// subscriptions não podem viver num repo público, e o Telegram já está aberto
// no seu celular o dia todo.

const API = (token, metodo) => `https://api.telegram.org/bot${token}/${metodo}`

const brl = (n) => `R$ ${n.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`

const BAGAGEM = { inclui: ' · com bagagem', nao_inclui: ' · SEM bagagem', nao_dito: '' }

const TIPO_EMOJI = {
  praia: '🏖', montanha: '⛰️', cultural: '🏛️', gastronomico: '🍽️', natureza: '🌿',
  esportes_inverno: '🎿', esportes_verao: '🏄', cidade_grande: '🌃', descanso: '🧘', aventura: '🎢',
}

function formatar(oferta, perfil) {
  const origem = oferta.origem_texto || '(origem não dita)'
  const casal = oferta.por_pessoa ? ` · ${brl(oferta.preco_brl * perfil.viajantes)} p/ ${perfil.viajantes}` : ''
  const p = oferta.posicionamento
  // 💛 quando agrada os dois; senão de quem é o gosto que puxou o alerta.
  const nomes = (perfil.pessoas || []).filter((x) => oferta.gosto?.[x.id]).map((x) => x.nome)
  const selo = oferta.match ? '💛 ' : ''
  const linhas = [
    `${p ? '🎯' : selo || '✈️'} *${oferta.destino_texto}* — ${brl(oferta.preco_brl)}${oferta.por_pessoa ? '/pessoa' : ''}${casal}`,
    `${origem} → ${oferta.destino_texto}${oferta.ida_e_volta ? ' · ida e volta' : ' · só ida'}${oferta.com_taxas ? ' · c/ taxas' : ''}${BAGAGEM[oferta.bagagem_despachada] || ''}`,
  ]
  // Tipo de viagem + de quem agrada.
  if (oferta.tipos?.length) {
    const t = oferta.tipos.slice(0, 3).map((x) => `${TIPO_EMOJI[x] || ''}${x.replace('_', ' ')}`).join(' · ')
    linhas.push(oferta.match ? `${t} — agrada os dois 💛` : nomes.length ? `${t} — ${nomes.join(' e ')} ia gostar` : t)
  }

  // A conta do posicionamento, entregue aberta. O app não sabe seu saldo de
  // milhas nem o preço do trecho doméstico de hoje — então dá o número e você
  // decide, em vez de prometer economia que ele não pode garantir.
  if (p) {
    linhas.push(
      `\n*Posicionamento:* sai ${brl(p.economia_por_pessoa)}/pessoa mais barato que de ${p.base_origem} (${brl(p.base_de_casa)}).`,
      `Economia p/ ${perfil.viajantes}: *${brl(p.economia_grupo)}* — vale se o ${p.trecho_domestico} custar menos que isso.`,
      `⚠️ Bilhete separado: a bagagem não segue sozinha e atraso no doméstico não é coberto pelo internacional. Deixe folga.`,
    )
  }
  // O selo que separa caçador de buscador. Só aparece com série real —
  // dizer "30% abaixo da média" com 2 amostras seria inventar autoridade.
  const b = oferta.baseline
  if (b?.tem_baseline) {
    const sinal = b.desvio_pct < 0 ? `${Math.abs(b.desvio_pct)}% ABAIXO` : `${b.desvio_pct}% acima`
    linhas.push(`\n📊 ${sinal} da mediana de 90 dias (${brl(b.mediana)}, ${b.amostras} amostras)` +
      (b.raro ? ` · 🔥 *raro*: só 1 em cada 10 dias esteve tão barato` : ''))
  } else if (b) {
    linhas.push(`\n📊 sem baseline ainda (${b.amostras}/${b.precisa} dias de série)`)
  }

  if (oferta.companhia) linhas.push(`Cia: ${oferta.companhia}${oferta.escalas === 0 ? ' · DIRETO' : oferta.escalas ? ` · ${oferta.escalas} escala(s)` : ''}`)
  if (oferta.janela) linhas.push(`Janela: ${oferta.janela}${oferta.noites ? ` (${oferta.noites} noites)` : ''}`)
  if (oferta.validade) linhas.push(`Janela: ${oferta.validade}`)
  if (oferta.observacao) linhas.push(`_${oferta.observacao}_`)
  // Visto: a pegadinha aparece sempre que o destino exige algo — é o item com
  // consequência física (o México barra brasileiro no portão desde 2022).
  if (oferta.visto && oferta.visto.exige !== 'NAO') {
    const peg = oferta.visto.pegadinha ? ` — ${oferta.visto.pegadinha.slice(0, 160)}` : ''
    linhas.push(`🛂 *Exige visto/autorização* (${oferta.visto.exige.toLowerCase().replace(/_/g, ' ')})${peg}`)
  }
  if (oferta.flags.length) linhas.push(`⚠️ ${oferta.flags.join(', ')} — confira antes de acreditar`)
  // O link do Melhores Destinos vai pra matéria deles com o afiliado intacto:
  // você clicando lá é o que paga a curadoria que este app consome. O do
  // Explore vai pro Google Flights. Rotular errado seria mandar você pro
  // lugar que o texto não prometeu.
  const f = oferta.fontes[0]
  const rotulo = f.nome === 'google-explore' ? 'Ver no Google Flights' : 'Ver no Melhores Destinos'
  linhas.push(`\n[${rotulo}](${f.link})`)
  return linhas.join('\n')
}

export async function alertar(ofertas, perfil, { token, chatId, seco }) {
  if (!ofertas.length) return { enviados: 0 }
  if (seco || !token || !chatId) {
    for (const o of ofertas) console.log(`\n--- alerta (seco) para ${perfil.nome} ---\n${formatar(o, perfil)}`)
    return { enviados: 0, seco: true }
  }

  let enviados = 0
  for (const o of ofertas) {
    const r = await fetch(API(token, 'sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: formatar(o, perfil),
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    })
    if (r.ok) enviados++
    else console.warn(`  ! telegram ${r.status}: ${(await r.text()).slice(0, 200)}`)
  }
  return { enviados }
}
