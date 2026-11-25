// Integração REAL: a interface (jsdom) conversa por HTTP com o backend FastAPI (uvicorn),
// iniciado por tests/global-setup.js. Nenhuma resposta é simulada.
import { describe, it, expect } from 'vitest';
import { carregar, contarLinhas, aguardarResposta, aguardarStatus } from './helpers.js';

const URL_BACKEND = process.env.BACKEND_URL;
const rodar = describe.skipIf(!URL_BACKEND);

// fetch do Node apontando para o backend. O sinal do jsdom não é aceito pelo fetch do Node.
const fetchReal = (base) => (url, opcoes = {}) => fetch(base + url, { ...opcoes, signal: undefined });
const post = (corpo, cabecalhos = { 'Content-Type': 'application/json' }) =>
  fetch(URL_BACKEND + '/api/analisar', { method: 'POST', headers: cabecalhos, body: corpo });

rodar('Integração: interface ↔ backend real', () => {
  const abrir = (opcoes = {}) => carregar({ fetchImpl: fetchReal(URL_BACKEND), ...opcoes });

  it('o indicador mostra "Backend conectado" usando o /api/health real', async () => {
    const t = await abrir();
    await aguardarStatus(t);
    expect(t.d.getElementById('status-backend').dataset.estado).toBe('ok');
  });

  it('Analisar envia o código, o backend responde e a interface exibe a resposta', async () => {
    const t = await abrir();
    t.digitar('x = 5\ntotal = preco * (qtd + 1)\n');
    t.analisar.click();
    await aguardarResposta(t);
    expect(t.resultados.dataset.estado).toBe('info');
    expect(t.resultados.textContent).toMatch(/Código recebido com sucesso\./);
    expect(t.resultados.textContent).toMatch(/2 linhas, 32 caracteres \(32 bytes\)/);
    expect(t.d.getElementById('eco-codigo').textContent).toBe('x = 5\ntotal = preco * (qtd + 1)\n');
  });

  it('todos os exemplos (válidos e com erro) vão e voltam sem alteração', async () => {
    const t = await abrir();
    for (const ex of t.w.EXEMPLOS) {
      t.escolher(ex.id);
      t.analisar.click();
      await aguardarResposta(t);
      expect(t.resultados.dataset.estado, ex.id).toBe('info');
      expect(t.d.getElementById('eco-codigo').textContent, ex.id).toBe(ex.codigo);
    }
  });

  it.each([
    ['acentos e emoji', 'nome = "Olá, João ✓ 😀 日本語"\n'],
    ['espaços nas pontas', '   x = 1   \n\n'],
    ['tabulações', 'x\t=\t5\n\ty = 1'],
    ['aspas e barras', 'a = "aspas \\" e \\\\ barra"'],
    ['HTML e SQL', '<b>x</b> & \'; DROP TABLE t; --'],
    ['caractere nulo', 'x = 1\u0000'],
  ])('caracteres especiais atravessam a rede intactos: %s', async (_n, texto) => {
    const t = await abrir();
    t.digitar(texto);
    t.analisar.click();
    await aguardarResposta(t);
    expect(t.resultados.dataset.estado).toBe('info');
    expect(t.d.getElementById('eco-codigo').textContent).toBe(texto);
  });

  it('as estatísticas exibidas coincidem com a contagem da própria interface', async () => {
    const t = await abrir();
    const texto = 'a = 1\nb = "ç😀"\nc = 3\n';
    t.digitar(texto);
    t.analisar.click();
    await aguardarResposta(t);
    const bytes = new TextEncoder().encode(texto).length;
    const pontosDeCodigo = Array.from(texto).length;      // o emoji conta 1, não 2
    expect(t.resultados.textContent).toContain(
      `${contarLinhas(texto)} linhas, ${pontosDeCodigo} caracteres (${bytes} bytes)`);
    // o contador da interface e a contagem do backend coincidem
    expect(t.d.getElementById('contador').textContent)
      .toBe(`${contarLinhas(texto)} linhas · ${pontosDeCodigo} caracteres`);
  });

  it('código acima do limite: o backend recusa (413) e a interface mostra a mensagem dele', async () => {
    const t = await abrir();
    t.digitar('a'.repeat(100001));     // atribuição por script ignora o maxlength do campo
    t.analisar.click();
    await aguardarResposta(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.resultados.textContent).toMatch(/excede o limite de 100000 caracteres/);
    expect(t.resultados.textContent).toMatch(/CODIGO_MUITO_LONGO \(HTTP 413\)/);
    expect(t.area.value.length).toBe(100001);   // o código continua no editor
  });

  it('chamada direta com texto vazio/espaços: o backend também valida (rejeitado 422)', async () => {
    const t = await abrir();
    const vazio = await t.w.ApiCompiladores.enviarCodigo('');
    expect(vazio).toMatchObject({ tipo: 'rejeitado', status: 422, erro: { codigo: 'CODIGO_VAZIO' } });
    const espacos = await t.w.ApiCompiladores.enviarCodigo(' \n\t ');
    expect(espacos).toMatchObject({ tipo: 'rejeitado', status: 422, erro: { codigo: 'CODIGO_APENAS_ESPACOS' } });
  });

  it('servidor fora do ar: a interface informa a falha e preserva o código', async () => {
    const t = await carregar({ fetchImpl: fetchReal('http://127.0.0.1:1') });   // porta sem servidor
    t.digitar('x = 1');
    t.analisar.click();
    await aguardarResposta(t);
    await aguardarStatus(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.resultados.textContent).toMatch(/Não foi possível comunicar com o servidor\. Verifique a conexão e tente novamente\./);
    expect(t.area.value).toBe('x = 1');
    expect(t.d.getElementById('status-backend').dataset.estado).toBe('erro');
  });
});

rodar('Integração: análise léxica e sintática exibida na interface (backend real)', () => {
  const abrir = () => carregar({ fetchImpl: fetchReal(URL_BACKEND) });

  it('CT-27: cada exemplo mostra o resultado do seu grupo (válido → árvore; com erro → erro sintático)', async () => {
    const t = await abrir();
    for (const ex of t.w.EXEMPLOS) {
      t.escolher(ex.id);
      t.analisar.click();
      await aguardarResposta(t);
      const secao = t.d.getElementById('secao-analise');
      expect(secao.hidden, ex.id).toBe(false);
      expect(secao.dataset.resultado, ex.id).toBe(ex.valido ? 'valido' : 'erro-sintatico');
      if (ex.valido) expect(t.d.querySelector('#arvore li[data-tipo="PROGRAMA"]'), ex.id).not.toBeNull();
      else expect(t.d.getElementById('bloco-erro-sintatico').textContent, ex.id).toMatch(/Erro sintático na linha \d+, coluna \d+/);
    }
  });

  it('erro léxico real: blocos separados por fase e parser não executado', async () => {
    const t = await abrir();
    t.digitar('a = 1 @ 2\nb = 3\n');
    t.analisar.click();
    await aguardarResposta(t);
    expect(t.d.getElementById('bloco-erros-lexicos').textContent).toMatch(/Linha 1, coluna 7/);
    expect(t.d.getElementById('bloco-sintatico-nao-executado')).not.toBeNull();
  });

  it('tokens da tabela, do código destacado e das folhas da árvore coincidem (C9)', async () => {
    const t = await abrir();
    t.digitar('preco = 10\nnome = "Olá, João 😀"\ntotal = preco * (qtd + 1)\n');
    t.analisar.click();
    await aguardarResposta(t);
    const linhas = [...t.d.querySelectorAll('#tabela-tokens tbody tr')];
    for (const tr of linhas) {
      const [i, tipo, lexema, l, c] = [...tr.children].map((td) => td.textContent);
      if (tipo === 'QUEBRA_DE_LINHA') continue;
      const span = t.d.querySelector(`#codigo-analisado .tok[data-i="${i}"]`);
      expect([span.textContent, span.dataset.l, span.dataset.c]).toEqual([lexema, l, c]);
    }
    t.w.Analise.selecionarNo(t.d.querySelector('#arvore li[data-tipo="TEXTO"]').dataset.id, { focar: false });
    expect([...t.d.querySelectorAll('#codigo-analisado .tok.destaque')].map((s) => s.textContent)).toEqual(['"Olá, João 😀"']);
  });

  it('HTML no código chega à árvore e aos tokens apenas como texto', async () => {
    const t = await abrir();
    t.digitar('x = "<img src=x onerror=alert(1)>"\n');
    t.analisar.click();
    await aguardarResposta(t);
    expect(t.d.querySelector('#secao-analise img')).toBeNull();
    expect(t.d.getElementById('arvore').textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

rodar('Integração: contrato HTTP real (cabeçalhos, status e corpo)', () => {
  it('200: JSON com o formato do contrato (campos anteriores preservados + análise)', async () => {
    const r = await post(JSON.stringify({ codigo: 'x = 5 +' }));
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    const d = await r.json();
    expect(d).toMatchObject({
      recebido: true, mensagem: 'Código recebido com sucesso.', codigo: 'x = 5 +',
      estatisticas: { linhas: 1, caracteres: 7, bytes: 7 },
    });
    expect(Object.keys(d).sort()).toEqual(
      ['codigo', 'estatisticas', 'lexico', 'mensagem', 'recebido', 'sintatico', 'sucesso']);
    expect(d.sucesso).toBe(false);
    expect(d.lexico.tokens.map((t) => t.lexema)).toEqual(['x', '=', '5', '+']);
    expect(d.sintatico).toMatchObject({ executado: true, sucesso: false, ast: null });
    expect(d.sintatico.erros[0]).toMatchObject({
      tipo: 'ERRO_SINTATICO', linha: 1, coluna: 8, encontrado: 'fim do código',
      esperado: ['identificador', 'número', 'string', '('],
    });
  });

  it('GET /api/gramatica devolve a tabela M', async () => {
    const g = await (await fetch(URL_BACKEND + '/api/gramatica')).json();
    expect(g.ll1).toBe(true);
    expect(g.tabela.FATOR['(']).toBe(16);
  });

  it.each([
    ['campo ausente', JSON.stringify({}), 422, 'CAMPO_OBRIGATORIO'],
    ['tipo inválido', JSON.stringify({ codigo: 42 }), 422, 'CAMPO_INVALIDO'],
    ['vazio', JSON.stringify({ codigo: '' }), 422, 'CODIGO_VAZIO'],
    ['só espaços', JSON.stringify({ codigo: '  \n ' }), 422, 'CODIGO_APENAS_ESPACOS'],
    ['corpo que não é JSON', 'isto não é json', 400, 'CORPO_INVALIDO'],
    ['corpo vazio', '', 400, 'CORPO_INVALIDO'],
    ['lista JSON', '[1,2]', 400, 'CORPO_INVALIDO'],
  ])('erro (%s) → HTTP %i %s, no formato padrão', async (_n, corpo, status, codigo) => {
    const r = await post(corpo);
    expect(r.status).toBe(status);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    const d = await r.json();
    expect(d.recebido).toBe(false);
    expect(d.erro.codigo).toBe(codigo);
    expect(typeof d.erro.mensagem).toBe('string');
    expect(Array.isArray(d.erro.detalhes)).toBe(true);
  });

  it('método GET em /api/analisar → 405 padronizado; rota inexistente → 404', async () => {
    const g = await fetch(URL_BACKEND + '/api/analisar');
    expect(g.status).toBe(405);
    expect((await g.json()).erro.codigo).toBe('METODO_NAO_PERMITIDO');
    const n = await fetch(URL_BACKEND + '/api/nao-existe');
    expect(n.status).toBe(404);
    expect((await n.json()).erro.codigo).toBe('ROTA_NAO_ENCONTRADA');
  });

  it('rotas anteriores continuam disponíveis', async () => {
    expect(await (await fetch(URL_BACKEND + '/api/health')).json()).toEqual({ status: 'ok' });
    expect(await (await fetch(URL_BACKEND + '/api/hello')).json()).toEqual({ message: 'Hello, World!' });
  });
});
