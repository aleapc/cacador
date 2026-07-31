import test from 'node:test'; import assert from 'node:assert/strict';
import { passaQualidade, pontuarDupla } from '../src/lib/ranking.js';
const q = { hotelEstrelas: 4, avaliacaoMinima: 4.5, minimoAvaliacoes: 100, aceitarSemClassificacao: false, escalasMaximas: 1 };
test('qualidade barra hotel abaixo do padrão', () => { assert.equal(passaQualidade({ itemTipo: 'escapada', estrelas: 3, avaliacao: 4.8, avaliacoes: 900 }, q), false); assert.equal(passaQualidade({ itemTipo: 'escapada', estrelas: 5, avaliacao: 4.8, avaliacoes: 900 }, q), true); });
test('score do casal privilegia a pessoa menos convencida', () => { const pessoas = [{ id: 'a', qualidade: q }, { id: 'b', qualidade: q }]; const s = pontuarDupla({ id: 'x', tipos: ['praia'] }, pessoas, { a: ['praia'], b: [] }, []); assert.ok(s.pontos < 58); });
