// Voo de posicionamento: GRU -> praça brasileira (com milhas) -> internacional.
//
// POR QUE ISTO EXISTE. Dados reais do Melhores Destinos em 16/07/2026:
//   Miami:       R$ 1.928 de Manaus   vs  R$ 2.809 de São Paulo  -> R$ 881/pessoa
//   San Andrés:  R$ 1.714 de Manaus   vs  R$ 2.284 de São Paulo  -> R$ 570/pessoa
//   Lisboa:      R$ 3.061 do Recife   vs  R$ 3.307 de São Paulo  -> R$ 246/pessoa
// A primeira versão do filtro rejeitava tudo que não saísse de SAO, chamando de
// "fora do perfil". Estava jogando fora a única coisa que este app faz e o
// alerta do Google não: origem não é restrição, é variável de custo. Com milhas
// para o trecho doméstico, R$ 881/pessoa vira R$ 1.762 no bolso do casal.
//
// O QUE ESTE MÓDULO NÃO FAZ, E NÃO DEVE FINGIR QUE FAZ:
// ele não sabe seu saldo de milhas, nem o preço do GRU->MAO de hoje. Então não
// decide por você — mede o ARBITRAGEM (a diferença) e entrega a conta pronta
// para você bater contra o custo do posicionamento. Prometer "economia de
// R$ 1.762" sem saber o custo do trecho doméstico seria o mesmo erro de número
// bonito e errado que motivou este projeto.

// Só compara o que é comparável. Miami de Manaus e Miami de SP são a mesma
// viagem com origens diferentes; Miami de Manaus e Cartagena de SP não são
// nada. E preço com taxa contra preço sem taxa é comparação falsa.
const comparavel = (a, b) =>
  a.destino_metro === b.destino_metro &&
  a.tipo === b.tipo &&
  a.ida_e_volta === b.ida_e_volta &&
  a.por_pessoa === b.por_pessoa &&
  a.com_taxas === b.com_taxas

export function marcarPosicionamento(ofertas, perfil) {
  const casa = perfil.origens || []
  if (!casa.length) return ofertas

  const deCasa = ofertas.filter((o) => casa.includes(o.origem_metro))

  return ofertas.map((o) => {
    if (casa.includes(o.origem_metro)) return o
    if (!o.origem_metro) return o // origem não atribuída: não dá para posicionar

    // A base é o MENOR preço de casa para o mesmo destino. Comparar contra um
    // preço de casa ruim inflaria a economia artificialmente.
    const base = deCasa
      .filter((b) => comparavel(b, o))
      .sort((a, b) => a.preco_brl - b.preco_brl)[0]

    if (!base || base.preco_brl <= o.preco_brl) return o

    const porPessoa = base.preco_brl - o.preco_brl
    return {
      ...o,
      posicionamento: {
        praca: o.origem_texto,
        praca_metro: o.origem_metro,
        base_de_casa: base.preco_brl,
        base_origem: base.origem_texto,
        economia_por_pessoa: porPessoa,
        economia_grupo: porPessoa * (perfil.viajantes || 1),
        // O trecho que você tem que cobrir com milhas ou dinheiro para
        // destravar a economia. O app não sabe quanto custa — você sabe.
        trecho_domestico: `${casa[0]}->${o.origem_metro}`,
      },
    }
  })
}

// DESLIGADO POR PADRÃO. Não é timidez — é que o app hoje não tem como saber se
// a economia é real, e alertar diferença bruta é mentir com número.
//
// O que a pesquisa de 2026-07-16 (fontes: ANAC Res.400, Melhores Destinos,
// Igor Pires/Diário do Nordeste, malha GOL) derrubou:
//
// 1. A DIFERENÇA BRUTA MENTE. Miami: R$ 881/pessoa de vantagem em Manaus, mas
//    o GRU<->MAO custa R$ 1.215-1.400 em dinheiro. Economia líquida NEGATIVA.
//    Sem o preço do doméstico, todo alerta daqui é um número bonito e errado.
// 2. SAZONALIDADE MATA. GOL MAO-MIA existe só de 18/06 a 09/08/2026, 2x/semana
//    (ida seg/sex, volta qui/dom), atrelada à Copa. Calibrar nisso é prometer
//    em outubro um voo que não existe.
// 3. A MALHA NÃO FECHA. Volta pousa em Manaus às 02:20 — pernoite forçado nas
//    duas pontas. Com 2 frequências semanais, perder o voo custa 3-4 DIAS.
// 4. A REGRA DAS 4 HORAS. Res. 400 da ANAC só obriga a cia a partir de 4h de
//    atraso, dentro do contrato dela. Atraso de 3h59 no doméstico = zero
//    direito e conexão perdida. Bilhetes separados são contratos separados;
//    mesma companhia não muda isso.
// 5. O NORDESTE ESTÁ INVERTIDO. Voos do NE para a Europa são MAIS caros que de
//    SP apesar de mais curtos (ocupação ~90%). Os R$ 246 do Recife são ruído
//    de promoção. Taxa de embarque também joga contra: GRU R$ 64,56 é a mais
//    barata do grupo; Manaus R$ 97,73, Recife R$ 100,62.
// 6. FEBRE AMARELA. Manaus->Caribe conecta em Panamá/Bogotá; a Colômbia exige
//    vacinação desde mar/2026. Prazo ~15 dias entre vacina e certificado —
//    um comparador que ignora isso manda o casal ao balcão sem embarcar.
// 7. MILHAS NÃO SALVAM. A Smiles não remarca bilhete-prêmio: só cancela, a
//    R$ 300 por trecho POR PASSAGEIRO. GRU<->MAO 2 pax = R$ 1.200 para
//    cancelar contra R$ 817 do resgate inteiro — desistir custa mais que a
//    viagem. E as milhas voltam com a validade ORIGINAL, podendo expirar.
//
// PARA RELIGAR, na ordem: (1) preço do trecho doméstico em dinheiro
// (Travelpayouts) para calcular economia LÍQUIDA; (2) janela de sazonalidade e
// dias de operação da ida E da volta por rota, com trava de "existe volta que
// fecha N noites?"; (3) trava sanitária de febre amarela por itinerário;
// (4) checar se a cia vende o trecho em bilhete ÚNICO — se vender, o risco de
// bilhete separado evapora e a discussão vira só "vale queimar milhas?".
export function valeOPosicionamento(oferta, perfil) {
  if (perfil.posicionamento?.ativo !== true) return false
  const p = oferta.posicionamento
  if (!p) return false
  const minimo = perfil.posicionamento?.economia_minima_grupo ?? 800
  return p.economia_grupo >= minimo
}
