// Vocabulário de tipos e rótulos — igual ao data/destinos.json.
export const TIPOS = [
  ['praia', '🏖', 'Praia'],
  ['montanha', '⛰️', 'Montanha'],
  ['cultural', '🏛️', 'Cultural'],
  ['gastronomico', '🍽️', 'Gastronômico'],
  ['natureza', '🌿', 'Natureza'],
  ['esportes_inverno', '🎿', 'Esp. de inverno'],
  ['esportes_verao', '🏄', 'Esp. de verão'],
  ['cidade_grande', '🌃', 'Cidade grande'],
  ['descanso', '🧘', 'Descanso'],
  ['aventura', '🎢', 'Aventura'],
];
export const TIPO_LABEL = Object.fromEntries(TIPOS.map(([k, em, l]) => [k, `${em} ${l.replace('Esp. de ', '')}`]));

export const CONTINENTES = [
  ['america_sul', 'América do Sul'],
  ['america_norte_central', 'América do N. e Central'],
  ['europa', 'Europa'],
  ['africa', 'África'],
  ['asia', 'Ásia'],
  ['oceania', 'Oceania'],
];
export const CONT_LABEL = Object.fromEntries(CONTINENTES);

export const PAISES = {
  AR:'Argentina', AT:'Áustria', BR:'Brasil', CA:'Canadá', CL:'Chile', CO:'Colômbia',
  DE:'Alemanha', DO:'República Dominicana', EC:'Equador', ES:'Espanha', IT:'Itália',
  JM:'Jamaica', JP:'Japão', MX:'México', PE:'Peru', PT:'Portugal', PY:'Paraguai',
  US:'Estados Unidos', UY:'Uruguai', ZA:'África do Sul'
};
export const pais = (iso2, fallback = '') => PAISES[iso2?.toUpperCase()] ?? fallback ?? iso2;

export const DURACOES = [
  ['curtissima', '1 a 3 noites', 1, 3],
  ['curta', '4 a 6 noites', 4, 6],
  ['semana', '7 a 10 noites', 7, 10],
  ['media', '11 a 14 noites', 11, 14],
  ['longa', '15 noites ou mais', 15, 30],
];

// Bandeira por ISO2 (emoji) — regional indicators.
export const flag = (iso2) =>
  iso2 && iso2.length === 2
    ? String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)))
    : '🌍';
