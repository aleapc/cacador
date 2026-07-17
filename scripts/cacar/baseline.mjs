// Série histórica de preço por rota, e o desvio contra ela.
//
// É isto que separa um caçador de um buscador. "Santiago R$ 1.070" não
// significa nada sozinho — nem pra você nem pra mim. "Santiago R$ 1.070,
// 22% abaixo da mediana dos últimos 90 dias" é informação. Oportunidade é
// desvio da linha de base, não valor absoluto; e a linha de base só existe
// se alguém guardar o preço todo dia.
//
// Por isso o histórico é commitado no repo: log de Action expira, série
// histórica não pode.

const DIAS = 90

// Mediana, não média: uma tarifa errada de R$ 45 ou um pico de alta temporada
// arrasta a média e não mexe na mediana. Queremos o preço TÍPICO, e o típico
// é robusto a outlier por construção.
const mediana = (xs) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}

const percentil = (xs, p) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

const rotaDe = (o) => `${o.origem_metro}-${o.destino_metro}`

export function registrar(historico, ofertas, hoje) {
  const h = { ...historico, rotas: { ...(historico.rotas || {}) } }
  const corte = new Date(Date.now() - DIAS * 86400000).toISOString().slice(0, 10)

  for (const o of ofertas) {
    if (!o.origem_metro || !o.destino_metro || !(o.preco_brl > 0)) continue
    if (!o.por_pessoa) continue // série é sempre por pessoa; misturar corrompe
    const k = rotaDe(o)
    const r = h.rotas[k] || { amostras: [] }
    // Uma amostra por rota por dia. O Explore roda 1x/dia; se algo rodar duas
    // vezes, o menor preço do dia vence — é o que a pessoa poderia ter pago.
    const jaHoje = r.amostras.find((a) => a.d === hoje)
    if (jaHoje) jaHoje.p = Math.min(jaHoje.p, o.preco_brl)
    else r.amostras.push({ d: hoje, p: o.preco_brl })
    r.amostras = r.amostras.filter((a) => a.d >= corte).sort((a, b) => a.d.localeCompare(b.d))
    h.rotas[k] = r
  }
  return h
}

export function avaliar(oferta, historico) {
  const r = historico.rotas?.[rotaDe(oferta)]
  const precos = (r?.amostras || []).map((a) => a.p)

  // Menos de 7 dias de série não é baseline, é ruído. Dizer "30% abaixo da
  // média" com 2 amostras seria inventar autoridade — exatamente o que este
  // projeto existe para não fazer. Sem série, o alerta sai sem o selo.
  if (precos.length < 7) {
    return { tem_baseline: false, amostras: precos.length, precisa: 7 }
  }

  const med = mediana(precos)
  const p10 = percentil(precos, 10)
  const desvio = Math.round(((oferta.preco_brl - med) / med) * 100)

  return {
    tem_baseline: true,
    amostras: precos.length,
    mediana: med,
    minimo_visto: Math.min(...precos),
    p10,
    desvio_pct: desvio,
    // "Raro" = abaixo do percentil 10 da própria rota. Não é limiar mágico:
    // é literalmente "só 1 em cada 10 dias esteve tão barato quanto hoje".
    raro: oferta.preco_brl <= p10,
  }
}

export function marcarBaseline(ofertas, historico) {
  return ofertas.map((o) => ({ ...o, baseline: avaliar(o, historico) }))
}
