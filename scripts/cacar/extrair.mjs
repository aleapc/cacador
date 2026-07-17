// Extração: matéria de blog (texto solto, em português, com armadilhas) ->
// registros estruturados {origem, destino, preço}.
//
// É AQUI que a API da Anthropic ganha o dinheiro dela. Não usamos o LLM para
// escrever prosa turística (isso seria estático e podia ser gerado uma vez e
// commitado); usamos para o trabalho que regex não faz: ler texto humano
// bagunçado e atribuir cada preço à origem CERTA.
//
// A armadilha que motiva tudo isto: o título diz "Portugal a partir de
// R$ 3.061, saindo de São Paulo" e o corpo diz "o menor valor é pra quem sai
// do Recife, mas tem voos saindo de São Paulo ... a partir de R$ 3.307".
// Um regex no título produziria "São Paulo -> Lisboa por R$ 3.061", que é
// falso. Só a leitura do corpo resolve.

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic() // lê ANTHROPIC_API_KEY do ambiente

const SCHEMA = {
  type: 'object',
  properties: {
    categoria: {
      type: 'string',
      enum: [
        'promocao_voo',
        'cupom_desconto',
        'seguro_viagem',
        'hotel_ou_resort',
        'pacote_voo_mais_hotel',
        'cruzeiro',
        'cartao_ou_pontos',
        'noticia',
        'outro',
      ],
      description: 'O que a matéria é. Só promocao_voo interessa; o resto é descartado.',
    },
    tipo: { type: 'string', enum: ['dinheiro', 'milhas', 'misto', 'nao_aplica'] },
    ida_e_volta: { type: 'boolean' },
    com_taxas: { type: 'boolean', description: 'O texto afirma "taxas inclusas"?' },
    por_pessoa: { type: 'boolean', description: 'O preço é por pessoa (quase sempre é)?' },
    validade: { type: 'string', description: 'Janela de viagem ou prazo, como o texto diz. "" se não disser.' },
    ofertas: {
      type: 'array',
      description:
        'Um registro por par (origem, destino) com preço explícito no TEXTO. Nunca invente uma origem. Se o texto dá um preço sem dizer de onde sai, use origem_texto="" — não chute.',
      items: {
        type: 'object',
        properties: {
          origem_texto: { type: 'string', description: 'Cidade de origem como o texto escreve. "" se não disser.' },
          origem_iata: { type: 'string', description: 'IATA do aeroporto ou "" se incerto. São Paulo=GRU, Rio=GIG, Recife=REC, Manaus=MAO.' },
          destino_texto: { type: 'string' },
          destino_iata: { type: 'string', description: 'IATA do destino ou "" se incerto.' },
          pais_iso2: { type: 'string', description: 'ISO 3166-1 alpha-2 do país de destino, ex: PT, US, MX.' },
          preco_brl: { type: 'number', description: 'Valor em reais. 3061 para "R$ 3.061".' },
          bagagem_despachada: {
            type: 'string',
            enum: ['inclui', 'nao_inclui', 'nao_dito'],
            description: 'Só marque inclui/nao_inclui se o TEXTO falar de bagagem para ESTE preço.',
          },
          companhia: { type: 'string' },
          observacao: { type: 'string', description: 'Ressalva curta do texto sobre este preço específico.' },
        },
        required: [
          'origem_texto', 'origem_iata', 'destino_texto', 'destino_iata',
          'pais_iso2', 'preco_brl', 'bagagem_despachada', 'companhia', 'observacao',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['categoria', 'tipo', 'ida_e_volta', 'com_taxas', 'por_pessoa', 'validade', 'ofertas'],
  additionalProperties: false,
}

const SISTEMA = `Você extrai dados de matérias de promoção de passagem aérea de blogs brasileiros.

REGRA MAIS IMPORTANTE — O TÍTULO MENTE, E ISSO É SISTEMÁTICO:
O título é chamada de marketing. Ele costuma juntar o MENOR preço da matéria com uma cidade que NÃO é a de onde aquele preço sai. Exemplo real:
  Título: "Portugal — Voos para Lisboa ou Porto a partir de R$ 3.061 ida e volta, saindo de São Paulo"
  Corpo:  "encontramos voos a partir de R$ 3.061 ida e volta. O menor valor é pra quem sai do Recife, mas tem voos saindo de São Paulo, com bagagem despachada, a partir de R$ 3.307"
  Correto: Recife->Lisboa R$ 3.061 (origem que o corpo atribui ao menor preço) E São Paulo->Lisboa R$ 3.307 (bagagem_despachada="inclui").
  ERRADO:  São Paulo->Lisboa R$ 3.061.
Extraia SEMPRE do corpo. Use o título só para saber do que a matéria trata.

REGRAS:
- Um registro por par (origem, destino) com preço explícito. Se o corpo dá 3 preços de 3 origens, são 3 registros.
- Nunca invente origem. Se um preço aparece sem origem atribuída, origem_texto="".
- bagagem_despachada só sai de "nao_dito" se o texto falar de bagagem PARA AQUELE preço.
- Se a matéria não é promoção de voo (é cupom, seguro, hotel, pacote voo+hotel, cruzeiro, cartão ou notícia), marque a categoria certa e devolva ofertas: [].
- Preço em milhas/pontos não é preço em reais: tipo="milhas" e só registre preco_brl se houver valor em R$ de verdade.`

export async function extrair(artigo) {
  const r = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    system: SISTEMA,
    // Extração curta e escopada: adaptive deixa o modelo pensar só onde a
    // atribuição preço->origem é ambígua; effort low corta o resto.
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `TÍTULO (não confie nele para preço): ${artigo.titulo}\n\nCORPO DA MATÉRIA:\n${artigo.texto}`,
      },
    ],
  })

  if (r.stop_reason === 'refusal') throw new Error('recusa do modelo')
  const bloco = r.content.find((b) => b.type === 'text')
  if (!bloco) throw new Error('sem bloco de texto na resposta')

  return {
    ...JSON.parse(bloco.text),
    _uso: { entrada: r.usage.input_tokens, saida: r.usage.output_tokens },
  }
}
