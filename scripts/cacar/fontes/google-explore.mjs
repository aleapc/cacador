// Google Travel Explore via SerpApi.
//
// Uma chamada devolve ~90 destinos saindo de GRU, cada um com preço, a janela
// de datas que o Google achou mais barata, escalas, companhia e duração. É
// descoberta e baseline no mesmo request.
//
// COTA: o SerpApi tem UM pool para todos os endpoints (Search, Maps, Flights,
// Trends) — 250/mês no plano free, ~8/dia. Rodando 1x/dia gastamos 30/mês.
// Busca repetida bate no cache e NÃO consome cota, então testar é de graça.
//
// PREÇO É POR PESSOA. Não passamos `adults`, então o Google cota 1 passageiro.
// Isso é deliberado: preço por pessoa é o que compara com o Melhores Destinos
// e o que a série histórica precisa. Multiplicar pelo casal é decisão de
// apresentação, no alerta — não de coleta.

import { idDe, metro } from '../util.mjs'

const noitesEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)

export async function coletar({ origem = 'GRU' } = {}) {
  const chave = process.env.SERPAPI_KEY
  if (!chave) return { nome: 'google-explore', status: 'sem_chave', ofertas: [], destinos: 0 }

  const p = new URLSearchParams({
    engine: 'google_travel_explore',
    departure_id: origem,
    currency: 'BRL',
    hl: 'pt-br',
    gl: 'br',
    api_key: chave,
  })

  const r = await (await fetch('https://serpapi.com/search?' + p)).json()
  if (r.error) throw new Error(`serpapi: ${r.error}`)

  const destinos = r.destinations || []
  const hoje = new Date().toISOString().slice(0, 10)

  const ofertas = destinos
    .filter((d) => d.flight_price > 0 && d.destination_airport?.code)
    .map((d) => {
      const noites = d.start_date && d.end_date ? noitesEntre(d.start_date, d.end_date) : null
      return {
        id: idDe(metro(origem), metro(d.destination_airport.code), 'dinheiro', String(d.flight_price), hoje),
        origem_texto: 'São Paulo',
        origem_metro: metro(origem),
        destino_texto: d.name,
        destino_metro: metro(d.destination_airport.code),
        // Guarda o IATA real do aeroporto (metro perde JFK→NYC): o price_insights
        // do SerpApi precisa do aeroporto, não da área metropolitana.
        destino_iata: d.destination_airport.code,
        origem_iata: origem,
        pais_texto: d.country || '',
        pais_iso2: '', // o Explore dá o país por nome; o iso2 vem do casamento com vistos.json
        preco_brl: d.flight_price,
        por_pessoa: true,
        ida_e_volta: true,
        com_taxas: true,
        tipo: 'dinheiro',
        // O Explore não diz nada sobre bagagem — e mentir "inclui" aqui seria
        // o erro que derrubou a análise do Claude-in-Chrome. Fica nao_dito.
        bagagem_despachada: 'nao_dito',
        companhia: d.airline || '',
        janela: d.start_date && d.end_date ? `${d.start_date} a ${d.end_date}` : '',
        janela_inicio: d.start_date || '',
        janela_fim: d.end_date || '',
        noites,
        escalas: d.number_of_stops,
        duracao_min: d.flight_duration,
        validade: '',
        observacao: '',
        flags: [],
        fontes: [{ nome: 'google-explore', link: d.link, titulo: `${d.name} — Google Flights` }],
        descoberto_em: hoje,
      }
    })

  return {
    nome: 'google-explore',
    status: ofertas.length ? 'ok' : 'vazio',
    destinos: destinos.length,
    ofertas,
    // Quanto sobrou da cota — se isso cair, o app precisa gritar antes de
    // ficar cego sem ninguém perceber.
    busca_em_cache: r.search_metadata?.status === 'Success',
  }
}

export async function cota() {
  const chave = process.env.SERPAPI_KEY
  if (!chave) return null
  const a = await (await fetch(`https://serpapi.com/account?api_key=${chave}`)).json()
  if (a.error) return null
  return { plano: a.plan_name, usadas: a.this_month_usage, total: a.searches_per_month, restantes: a.total_searches_left }
}
