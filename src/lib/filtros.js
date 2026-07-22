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

// Bandeira por ISO2 (emoji) — regional indicators.
export const flag = (iso2) =>
  iso2 && iso2.length === 2
    ? String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)))
    : '🌍';
