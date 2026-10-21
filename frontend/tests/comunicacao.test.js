// Comunicação frontend → backend (contrato em docs/API.md), com o backend simulado.
// O comportamento contra o backend REAL está em integracao.test.js.
import { describe, it, expect } from 'vitest';
import { carregar, backendSimulado, erroApi, sucessoApi, esperar, clicarAnalisar } from './helpers.js';

const saudavel = { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
// fetch cuja resposta a /api/analisar é definida pelo teste
const fetchCom = (resposta) => (url, opcoes) =>
  url === '/api/health' ? Promise.resolve(saudavel) : resposta(url, opcoes);
const resp = (status, corpo, { semJson = false } = {}) => () => Promise.resolve({
  ok: status >= 200 && status < 300, status,
  json: async () => { if (semJson) throw new SyntaxError('não é JSON'); return corpo; },
});

describe('api.js — requisição', () => {
  it('envia POST same-origin para /api/analisar com JSON { codigo }', async () => {
    const t = await carregar();
    const r = await t.w.ApiCompiladores.enviarCodigo('x = 5\n');
    expect(r.tipo).toBe('sucesso');
    const { url, opcoes } = t.chamadas[0];
    expect(url).toBe('/api/analisar');
    expect(opcoes.method).toBe('POST');
    expect(opcoes.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opcoes.body)).toEqual({ codigo: 'x = 5\n' });
    expect(opcoes.signal).toBeDefined();   // permite cancelar por tempo limite
  });

  it('não altera o código ao serializar (sem trim nem normalização)', async () => {
    const t = await carregar();
    const texto = '  x\t= "á😀"\r\n\n  ';
    await t.w.ApiCompiladores.enviarCodigo(texto);
    expect(JSON.parse(t.chamadas[0].opcoes.body).codigo).toBe(texto);
  });
});

describe('api.js — classificação das respostas', () => {
  it('200 no formato do contrato → sucesso, com os dados', async () => {
    const t = await carregar({ fetchImpl: fetchCom(resp(200, sucessoApi('a = 1'))) });
    const r = await t.w.ApiCompiladores.enviarCodigo('a = 1');
    expect(r).toEqual({ tipo: 'sucesso', dados: sucessoApi('a = 1') });
  });

  it.each([
    [422, 'CODIGO_VAZIO'], [422, 'CAMPO_OBRIGATORIO'], [422, 'CAMPO_INVALIDO'],
    [413, 'CODIGO_MUITO_LONGO'], [400, 'CORPO_INVALIDO'],
  ])('HTTP %i com erro padronizado (%s) → rejeitado', async (status, codigo) => {
    const t = await carregar({ fetchImpl: fetchCom(resp(status, erroApi(codigo, 'msg'))) });
    const r = await t.w.ApiCompiladores.enviarCodigo('x');
    expect(r.tipo).toBe('rejeitado');
    expect(r.status).toBe(status);
    expect(r.erro.codigo).toBe(codigo);
  });

  it.each([
    ['502 com HTML do Nginx', resp(502, undefined, { semJson: true }), 502],
    ['413 do Nginx (HTML)', resp(413, undefined, { semJson: true }), 413],
    ['500 sem o formato padrão', resp(500, { detail: 'boom' }), 500],
    ['404 com JSON qualquer', resp(404, { qualquer: 1 }), 404],
    ['erro com recebido:true (incoerente)', resp(422, { recebido: true, erro: { codigo: 'X', mensagem: 'm' } }), 422],
  ])('%s → falha "http"', async (_n, impl, status) => {
    const t = await carregar({ fetchImpl: fetchCom(impl) });
    const r = await t.w.ApiCompiladores.enviarCodigo('x');
    expect(r).toEqual({ tipo: 'falha', motivo: 'http', status });
  });

  it.each([
    ['corpo vazio', resp(200, undefined, { semJson: true })],
    ['objeto vazio', resp(200, {})],
    ['recebido:false', resp(200, { ...sucessoApi('x'), recebido: false })],
    ['sem estatísticas', resp(200, { recebido: true, mensagem: 'm', codigo: 'x' })],
    ['estatísticas com tipo errado', resp(200, { ...sucessoApi('x'), estatisticas: { linhas: '1', caracteres: 1, bytes: 1 } })],
    ['codigo que não é texto', resp(200, { ...sucessoApi('x'), codigo: 7 })],
    ['lista', resp(200, [])],
    ['null', resp(200, null)],
  ])('200 fora do contrato (%s) → falha "resposta-invalida"', async (_n, impl) => {
    const t = await carregar({ fetchImpl: fetchCom(impl) });
    const r = await t.w.ApiCompiladores.enviarCodigo('x');
    expect(r.tipo).toBe('falha');
    expect(r.motivo).toBe('resposta-invalida');
  });

  it('servidor inalcançável → falha "rede", sem lançar exceção', async () => {
    const t = await carregar({ fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')) });
    await expect(t.w.ApiCompiladores.enviarCodigo('x')).resolves.toEqual({ tipo: 'falha', motivo: 'rede' });
  });

  it('sem resposta dentro do tempo limite → falha "tempo"', async () => {
    const lento = fetchCom((_u, op) => new Promise((_res, rej) => {
      op.signal.addEventListener('abort', () => rej(Object.assign(new Error('abortado'), { name: 'AbortError' })));
    }));
    const t = await carregar({ fetchImpl: lento, config: { tempoLimiteMs: 30 } });
    const r = await t.w.ApiCompiladores.enviarCodigo('x');
    expect(r).toEqual({ tipo: 'falha', motivo: 'tempo' });
  });
});

describe('Interface — exibição do retorno do backend', () => {
  it('mostra a mensagem e as estatísticas DO BACKEND (não valores fixos nem calculados no cliente)', async () => {
    const corpo = { ...sucessoApi('x = 1'), mensagem: 'Mensagem vinda do servidor', estatisticas: { linhas: 99, caracteres: 88, bytes: 77 } };
    const t = await carregar({ fetchImpl: fetchCom(resp(200, corpo)) });
    t.digitar('x = 1');
    await clicarAnalisar(t);
    expect(t.resultados.textContent).toMatch(/Mensagem vinda do servidor/);
    expect(t.resultados.textContent).toMatch(/99 linhas, 88 caracteres \(77 bytes\)/);
  });

  it('o resultado depende de a requisição acontecer: sem resposta do servidor não há "sucesso"', async () => {
    const t = await carregar({ fetchImpl: fetchCom(() => new Promise(() => {})) });  // nunca responde
    t.digitar('x = 1');
    t.analisar.click();
    await esperar();
    expect(t.resultados.dataset.estado).toBe('info');
    expect(t.resultados.textContent).toMatch(/Enviando/);
    expect(t.resultados.textContent).not.toMatch(/recebido/i);
  });

  it.each([
    [422, 'CODIGO_VAZIO', 'Nenhum código foi informado.'],
    [413, 'CODIGO_MUITO_LONGO', 'O código excede o limite de 100000 caracteres.'],
    [400, 'CORPO_INVALIDO', 'O corpo da requisição deve ser um objeto JSON.'],
    [422, 'CAMPO_OBRIGATORIO', 'O campo "codigo" é obrigatório.'],
  ])('erro do backend %i %s: mostra a mensagem dele e o código do erro', async (status, codigo, mensagem) => {
    const t = await carregar({ fetchImpl: fetchCom(resp(status, erroApi(codigo, mensagem, [{ campo: 'codigo', problema: mensagem }]))) });
    t.digitar('x = 1');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.resultados.getAttribute('role')).toBe('alert');
    expect(t.resultados.querySelector('.titulo-msg').textContent).toBe(mensagem);
    expect(t.resultados.textContent).toContain(`${codigo} (HTTP ${status})`);
    expect(t.area.value).toBe('x = 1');
    expect(t.analisar.disabled).toBe(false);
  });

  it('mostra detalhes adicionais do erro quando existem', async () => {
    const t = await carregar({ fetchImpl: fetchCom(resp(422, erroApi('CAMPO_INVALIDO', 'Tipo inválido', [{ campo: 'codigo', problema: 'deve ser texto' }]))) });
    t.digitar('x');
    await clicarAnalisar(t);
    expect(t.resultados.textContent).toMatch(/deve ser texto/);
  });

  it.each([
    ['rede', () => Promise.reject(new TypeError('x')), /Não foi possível comunicar com o servidor\. Verifique a conexão e tente novamente\./],
    ['http', resp(502, undefined, { semJson: true }), /erro inesperado[\s\S]*HTTP 502/],
    ['resposta-invalida', resp(200, { ok: 1 }), /Resposta inesperada do backend/],
  ])('falha de comunicação (%s): mensagem clara, código preservado, botão liberado', async (_n, impl, esperado) => {
    const t = await carregar({ fetchImpl: fetchCom(impl) });
    t.digitar('x = 1');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.resultados.textContent).toMatch(esperado);
    expect(t.resultados.textContent).toMatch(/continua no editor/);
    expect(t.area.value).toBe('x = 1');
    expect(t.analisar.disabled).toBe(false);
  });

  it('falha por tempo limite é informada ao usuário', async () => {
    const lento = fetchCom((_u, op) => new Promise((_r, rej) => {
      op.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })));
    }));
    const t = await carregar({ fetchImpl: lento, config: { tempoLimiteMs: 30 } });
    t.digitar('x = 1');
    t.analisar.click();
    await new Promise((r) => setTimeout(r, 150));
    expect(t.resultados.textContent).toMatch(/demorou demais/);
    expect(t.analisar.disabled).toBe(false);
  });

  it('após uma falha, o usuário consegue tentar de novo com sucesso', async () => {
    let tentativas = 0;
    const t = await carregar({
      fetchImpl: fetchCom(() => (++tentativas === 1
        ? Promise.reject(new TypeError('x'))
        : Promise.resolve({ ok: true, status: 200, json: async () => sucessoApi('x = 1') }))),
    });
    t.digitar('x = 1');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('info');
    expect(t.resultados.textContent).toMatch(/Código recebido com sucesso/);
  });

  it('entrada vazia/espaços é barrada na interface sem chamar o backend', async () => {
    const t = await carregar();
    for (const texto of ['', '  \n\t']) {
      t.digitar(texto);
      await clicarAnalisar(t);
    }
    expect(t.chamadas.length).toBe(0);
  });

  it('cada clique em Analisar faz uma requisição nova ao backend', async () => {
    const t = await carregar();
    t.digitar('x = 1');
    await clicarAnalisar(t);
    await clicarAnalisar(t);
    expect(t.chamadas.length).toBe(2);
  });

  it('o indicador de status usa /api/health', async () => {
    const urls = [];
    const t = await carregar({ fetchImpl: (u) => { urls.push(u); return Promise.resolve(saudavel); } });
    await esperar();
    expect(urls).toContain('/api/health');
    expect(t.d.getElementById('status-backend').dataset.estado).toBe('ok');
  });
});

describe('Interface — mensagens ao usuário e erros inesperados', () => {
  it('mensagens de falha não expõem comandos, caminhos internos nem detalhes técnicos', async () => {
    const cenarios = [
      () => Promise.reject(new TypeError('Failed to fetch http://interno:8000')),
      resp(502, undefined, { semJson: true }),
      resp(200, { ok: 1 }),
    ];
    for (const impl of cenarios) {
      const t = await carregar({ fetchImpl: fetchCom(impl) });
      t.digitar('x = 1');
      await clicarAnalisar(t);
      const texto = t.resultados.textContent;
      expect(texto).not.toMatch(/docker|docs\/API|interno:8000|TypeError|SyntaxError/i);
    }
  });

  it('erro inesperado dentro da camada de comunicação: mensagem genérica, editor preservado, botão liberado', async () => {
    const t = await carregar();
    t.w.ApiCompiladores.enviarCodigo = () => { throw new Error('segredo interno'); };
    t.digitar('x = 1');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.resultados.getAttribute('role')).toBe('alert');
    expect(t.resultados.textContent).toMatch(/Ocorreu um erro inesperado/);
    expect(t.resultados.textContent).toMatch(/continua no editor/);
    expect(t.resultados.textContent).not.toMatch(/segredo interno/);
    expect(t.area.value).toBe('x = 1');
    expect(t.analisar.disabled).toBe(false);
  });

  it('após erro inesperado, a interface continua utilizável', async () => {
    const t = await carregar({ fetchImpl: fetchCom(resp(200, sucessoApi('x = 1'))) });
    const real = t.w.ApiCompiladores.enviarCodigo;
    t.w.ApiCompiladores.enviarCodigo = () => { throw new Error('falha'); };
    t.digitar('x = 1');
    await clicarAnalisar(t);
    expect(t.resultados.textContent).toMatch(/Ocorreu um erro inesperado/);
    t.w.ApiCompiladores.enviarCodigo = real;
    await clicarAnalisar(t);
    expect(t.resultados.textContent).toMatch(/Código recebido com sucesso/);
  });
});
