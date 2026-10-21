import { JSDOM } from 'jsdom';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- Utilitários ----------
export const contarLinhas = (t) =>
  t === '' ? 0 : t.replace(/(\r\n|\r|\n)$/, '').split(/\r\n|\r|\n/).length;

// Backend simulado (testes de unidade da interface): espelha o contrato de POST /api/analisar.
// Opções: alterar (devolve código diferente), status (HTTP), corpo (corpo fixo para respostas de erro),
// semJson (corpo que não é JSON, como a página de erro do Nginx).
export function backendSimulado(chamadas, { alterar = false, status = 200, corpo, semJson = false } = {}) {
  return (url, opcoes = {}) => {
    if (url === '/api/health') {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'ok' }) });
    }
    chamadas.push({ url, opcoes });
    if (status !== 200) {
      return Promise.resolve({
        ok: false, status,
        json: async () => { if (semJson) throw new SyntaxError('Unexpected token <'); return corpo; },
      });
    }
    const { codigo } = JSON.parse(opcoes.body);
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => corpo !== undefined ? corpo : ({
        recebido: true, mensagem: 'Código recebido com sucesso.',
        codigo: alterar ? codigo + '!' : codigo,
        estatisticas: {
          linhas: contarLinhas(codigo), caracteres: codigo.length,
          bytes: new TextEncoder().encode(codigo).length,
        },
      }),
    });
  };
}

// Corpo de erro no formato padrão da API.
export const erroApi = (codigo, mensagem, detalhes = []) =>
  ({ recebido: false, erro: { codigo, mensagem, detalhes } });

// Resposta 200 mínima válida, para testes que controlam o fetch manualmente.
export const sucessoApi = (codigo) => ({
  recebido: true, mensagem: 'Código recebido com sucesso.', codigo,
  estatisticas: { linhas: contarLinhas(codigo), caracteres: codigo.length, bytes: codigo.length },
});

export class ArmazenamentoFalso {
  constructor() { this.dados = new Map(); }
  getItem(k) { return this.dados.has(k) ? this.dados.get(k) : null; }
  setItem(k, v) { this.dados.set(k, String(v)); }
  removeItem(k) { this.dados.delete(k); }
}

export async function carregar({ fetchImpl, armazenamento = new ArmazenamentoFalso(), semStorage = false, config } = {}) {
  const chamadas = [];
  const dom = await JSDOM.fromFile(path.join(raiz, 'index.html'), {
    runScripts: 'dangerously',
    resources: 'usable',
    beforeParse(window) {
      if (config) window.APP_CONFIG = config;
      window.fetch = fetchImpl ? fetchImpl : backendSimulado(chamadas);
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: semStorage
          ? { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } }
          : armazenamento,
      });
    },
  });
  await new Promise((r) => dom.window.addEventListener('load', r));
  const w = dom.window;
  const d = w.document;
  return {
    w, d, chamadas, armazenamento,
    area: d.getElementById('codigo'),
    resultados: d.getElementById('resultados'),
    seletor: d.getElementById('seletor-exemplos'),
    analisar: d.getElementById('btn-analisar'),
    limpar: d.getElementById('btn-limpar'),
    digitar(texto) { this.area.value = texto; this.area.dispatchEvent(new w.Event('input')); },
    escolher(id) { this.seletor.value = id; this.seletor.dispatchEvent(new w.Event('change')); },
  };
}

export const esperar = () => new Promise((r) => setTimeout(r, 0));
export async function clicarAnalisar(t) { t.analisar.click(); await esperar(); await esperar(); }


// Espera (por polling) o fim de um envio: botão Analisar liberado. Evita esperas fixas.
export async function aguardarResposta(t, limiteMs = 8000) {
  const fim = Date.now() + limiteMs;
  await esperar();
  while (Date.now() < fim) {
    if (!t.analisar.disabled) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Tempo esgotado aguardando a resposta do backend');
}

// Espera o indicador de status do backend sair de "verificando".
export async function aguardarStatus(t, limiteMs = 5000) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (t.d.getElementById('status-backend').dataset.estado !== 'verificando') return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Tempo esgotado aguardando o status do backend');
}
