// Baseline instantâneo via Google Flights Price Insights (SerpApi).
//
// O Google JÁ tem o histórico de preço de cada rota. Uma chamada ao engine
// google_flights devolve price_insights: {price_level: low|typical|high,
// typical_price_range: [min,max], price_history: [~60 pontos]}. Isso é o
// "desvio da média" pronto — sem esperar os 90 dias que a série caseira leva
// pra encher.
//
// POR QUE NÃO SUBSTITUI A SÉRIE CASEIRA DE VEZ: custa cota (250/mês,
// compartilhada com o Explore). Então isto é SUPLEMENTO: enriquece só os
// melhores candidatos que AINDA não têm série própria de 7 dias, e só na
// rodada diária do Explore. ~6 chamadas/dia = 180/mês, cabe nos 250 com o
// Explore (30/mês). A série caseira segue como fonte primária de graça.

const MED = (a, b) => Math.round((a + b) / 2)

// Uma chamada por rota+datas. Devolve o veredito do Google, ou null se não
// vier (rota sem histórico, erro, cota).
export async function insight({ origem_iata, destino_iata, janela_inicio, janela_fim }) {
  const chave = process.env.SERPAPI_KEY
  if (!chave || !origem_iata || !destino_iata || !janela_inicio) return null

  const p = new URLSearchParams({
    engine: 'google_flights',
    departure_id: origem_iata,
    arrival_id: destino_iata,
    outbound_date: janela_inicio,
    return_date: janela_fim || janela_inicio,
    type: janela_fim ? '1' : '2', // 1=ida e volta, 2=só ida
    currency: 'BRL',
    hl: 'pt-br',
    gl: 'br',
    api_key: chave,
  })

  try {
    const r = await (await fetch('https://serpapi.com/search?' + p)).json()
    const pi = r.price_insights
    if (!pi || !pi.price_level) return null
    const faixa = pi.typical_price_range || []
    const tipico = faixa.length === 2 ? MED(faixa[0], faixa[1]) : null
    const preco = pi.lowest_price
    return {
      fonte: 'google-price-insights',
      nivel: pi.price_level, // low | typical | high
      tipico,
      faixa,
      lowest: preco,
      // % contra a mediana da faixa típica do Google — o mesmo sinal da série
      // caseira, mas com a autoridade do histórico do próprio Google.
      desvio_pct: tipico && preco ? Math.round(((preco - tipico) / tipico) * 100) : null,
      pontos_historico: (pi.price_history || []).length,
    }
  } catch {
    return null
  }
}

// Enriquece um lote bounded de ofertas com o insight. Só as que passam o
// filtro pré (top candidatos sem baseline próprio). Serializado pra respeitar
// o rate limit do SerpApi (50/hora no free).
export async function enriquecerInsights(ofertas, { max = 6 } = {}) {
  let usadas = 0
  for (const o of ofertas) {
    if (usadas >= max) break
    const i = await insight({
      origem_iata: o.origem_iata || (o.origem_metro === 'SAO' ? 'GRU' : null),
      destino_iata: o.destino_iata || o.destino_metro,
      janela_inicio: o.janela_inicio,
      janela_fim: o.janela_fim,
    })
    if (i) {
      o.insight = i
      usadas++
    }
  }
  return usadas
}
