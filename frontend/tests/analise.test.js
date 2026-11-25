// Exibição da análise léxica e sintática (analise.js): árvore, tokens, erros por fase,
// passo a passo e tabela M. As respostas do backend são REAIS, gravadas em tests/fixtures
// por scripts/gerar-fixtures.py (o backend tem um teste que confere se estão atualizadas).
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregar, clicarAnalisar, esperar, analiseMinima } from './helpers.js';

const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const fixture = (nome) => JSON.parse(readFileSync(path.join(pasta, `${nome}.json`), 'utf-8'));

const saudavel = { ok: true, status: 200, json: async () => ({ status: 'ok' }) };
// Backend simulado que devolve a resposta real gravada para o código enviado.
function backendComFixtures(extra = {}) {
  const porCodigo = new Map();
  ['valido', 'erro-sintatico', 'erro-fim', 'erro-lexico', 'comentario'].forEach((n) => {
    const f = fixture(n);
    porCodigo.set(f.codigo, f);
  });
  const urls = [];
  const impl = (url, opcoes = {}) => {
    urls.push(url);
    if (url === '/api/health') return Promise.resolve(saudavel);
    if (url === '/api/gramatica') return Promise.resolve({ ok: true, status: 200, json: async () => fixture('gramatica') });
    const { codigo } = JSON.parse(opcoes.body);
    const corpo = extra[codigo] || porCodigo.get(codigo);
    return Promise.resolve({ ok: true, status: 200, json: async () => corpo });
  };
  impl.urls = urls;
  return impl;
}

async function analisarCom(nome, opcoes = {}) {
  const fetchImpl = backendComFixtures(opcoes.extra);
  const t = await carregar({ fetchImpl });
  t.fetchImpl = fetchImpl;
  t.digitar(opcoes.codigo !== undefined ? opcoes.codigo : fixture(nome).codigo);
  await clicarAnalisar(t);
  await esperar();
  const $ = (id) => t.d.getElementById(id);
  t.$ = $;
  t.secao = $('secao-analise');
  t.arvore = $('arvore');
  t.li = (tipo, n = 0) => t.arvore.querySelectorAll(`li[data-tipo="${tipo}"]`)[n];
  t.selecionar = (li) => li.querySelector('.rotulo-no').click();
  t.destacados = () => [...$('codigo-analisado').querySelectorAll('.tok.destaque')].map((s) => s.textContent);
  return t;
}

describe('Programa válido', () => {
  it('mostra a seção de análise com resultado "válido" e os resumos de cada fase', async () => {
    const t = await analisarCom('valido');
    expect(t.secao.hidden).toBe(false);
    expect(t.secao.dataset.resultado).toBe('valido');
    expect(t.$('bloco-lexico-ok').textContent).toMatch(/22 tokens, sem erros/);
    expect(t.$('bloco-sintatico-ok').textContent).toMatch(/programa válido; 2 atribuições; AST com 20 nós/);
    expect(t.resultados.textContent).toMatch(/Resultado: programa válido/);
    expect(t.$('bloco-erro-sintatico')).toBeNull();
    expect(t.$('bloco-erros-lexicos')).toBeNull();
  });

  it('a árvore reflete a precedência: a multiplicação fica abaixo da adição', async () => {
    const t = await analisarCom('valido');
    const soma = t.li('ADICAO');
    expect(soma.querySelector('li[data-tipo="MULTIPLICACAO"]')).not.toBeNull();
    expect(t.li('MULTIPLICACAO').querySelector('li[data-tipo="ADICAO"]')).toBeNull();
    expect(t.arvore.querySelector('li[aria-level="1"]').textContent).toMatch(/Programa \(2 atribuições\)/);
  });

  it('árvore pequena começa totalmente expandida, com papéis ARIA de árvore', async () => {
    const t = await analisarCom('valido');
    expect(t.arvore.getAttribute('role')).toBe('tree');
    const itens = t.arvore.querySelectorAll('li[role="treeitem"]');
    expect(itens.length).toBe(20);
    expect(t.arvore.querySelectorAll('li[aria-expanded="false"]').length).toBe(0);
  });

  it('selecionar um nó destaca exatamente o trecho dele no código e na tabela de tokens', async () => {
    const t = await analisarCom('valido');
    const mult = t.li('MULTIPLICACAO');                // 3 * 4, linha 1
    t.selecionar(mult);
    expect(mult.getAttribute('aria-selected')).toBe('true');
    expect(t.destacados()).toEqual(['3', '*', '4']);
    expect([...t.$('tabela-tokens').querySelectorAll('tr.destaque')].map((tr) => tr.children[2].textContent))
      .toEqual(['3', '*', '4']);
    const det = t.$('detalhes-selecao').textContent;
    expect(det).toMatch(/Nó selecionado: Multiplicação/);
    expect(det).toMatch(/TERMO' → \* FATOR TERMO'/);       // regra gramatical
    expect(det).toMatch(/linha 1, colunas 13 a 17/);
    expect(det).toMatch(/3 \* 4/);
  });

  it('o agrupamento destaca os parênteses e o que está dentro', async () => {
    const t = await analisarCom('valido');
    t.selecionar(t.li('AGRUPAMENTO'));
    expect(t.destacados()).toEqual(['(', '2', '+', '3', ')']);
  });

  it('teclado: setas navegam, ← recolhe, → expande e Enter seleciona', async () => {
    const t = await analisarCom('valido');
    const raiz = t.arvore.querySelector('li[aria-level="1"]');
    raiz.focus();
    const tecla = (key) => t.d.activeElement.dispatchEvent(new t.w.KeyboardEvent('keydown', { key, bubbles: true }));
    tecla('ArrowDown');
    const primeira = t.li('ATRIBUICAO');
    expect(t.d.activeElement).toBe(primeira);
    tecla('ArrowLeft');
    expect(primeira.getAttribute('aria-expanded')).toBe('false');
    tecla('ArrowRight');
    expect(primeira.getAttribute('aria-expanded')).toBe('true');
    tecla('Enter');
    expect(primeira.getAttribute('aria-selected')).toBe('true');
    expect(t.destacados()).toEqual(['total', '=', '2', '+', '3', '*', '4']);
  });

  it('recolher tudo e expandir tudo', async () => {
    const t = await analisarCom('valido');
    t.$('btn-recolher').click();
    const visiveis = () => [...t.arvore.querySelectorAll('li[role="treeitem"]')].filter((li) => !li.closest('ul[hidden]')).length;
    expect(visiveis()).toBe(3);                            // programa + 2 atribuições
    t.$('btn-expandir').click();
    expect(visiveis()).toBe(20);
  });

  it('filtro por tipo destaca os nós daquele tipo', async () => {
    const t = await analisarCom('valido');
    const filtro = t.$('filtro-tipo');
    expect([...filtro.options].map((o) => o.value)).toContain('NUMERO');
    filtro.value = 'NUMERO';
    filtro.dispatchEvent(new t.w.Event('change'));
    // total = 2 + 3 * 4 (3 números); media = (2 + 3) * 4 / 2 - 1 (5 números)
    expect(t.arvore.querySelectorAll('li.filtrado').length).toBe(8);
    expect(t.$('info-arvore').textContent).toMatch(/8 nós destacados do tipo NUMERO/);
  });

  it('exporta a AST em JSON', async () => {
    const t = await analisarCom('valido');
    let conteudo = null;
    let nome = null;
    t.w.Blob = class { constructor(partes) { this.partes = partes; } };     // jsdom: Blob sem .text()
    t.w.URL.createObjectURL = vi.fn((blob) => { conteudo = blob.partes.join(''); return 'blob:ast'; });
    t.w.URL.revokeObjectURL = vi.fn();
    t.w.HTMLAnchorElement.prototype.click = function () { nome = this.download; };
    t.$('btn-exportar').click();
    expect(nome).toBe('ast.json');
    expect(JSON.parse(conteudo)).toEqual(fixture('valido').sintatico.ast);
  });

  it('tabela de tokens: uma linha por token, posições iguais às do código destacado (consistência)', async () => {
    const t = await analisarCom('valido');
    const tokens = fixture('valido').lexico.tokens;
    const linhas = t.$('tabela-tokens').querySelectorAll('tbody tr');
    expect(linhas.length).toBe(tokens.length);
    tokens.forEach((tok, i) => {
      const c = linhas[i].children;
      expect([c[1].textContent, c[3].textContent, c[4].textContent]).toEqual([tok.tipo, String(tok.linha), String(tok.coluna)]);
      if (tok.tipo !== 'QUEBRA_DE_LINHA') {
        const span = t.$('codigo-analisado').querySelector(`.tok[data-i="${i}"]`);
        expect([span.textContent, span.dataset.l, span.dataset.c]).toEqual([tok.lexema, String(tok.linha), String(tok.coluna)]);
      }
    });
    expect(t.$('contagem-categorias').textContent).toMatch(/Número inteiro: 8/);
  });

  it('selecionar um token mostra a folha correspondente na árvore', async () => {
    const t = await analisarCom('valido');
    t.$('tabela-tokens').querySelector('tr[data-i="0"]').click();       // "total"
    expect(t.arvore.querySelector('li.relacionado').textContent).toMatch(/Identificador: total/);
    t.$('tabela-tokens').querySelector('tr[data-i="1"]').click();       // "=" não vira nó
    expect(t.$('detalhes-selecao').textContent).toMatch(/sem nó próprio/);
  });

  it('o código analisado é exibido como texto (sem interpretar HTML)', async () => {
    const codigo = 'x = "<img src=x onerror=alert(1)>"\n';
    const resposta = { ...fixture('comentario'), codigo, lexico: { sucesso: true, erros: [],
      tokens: [{ tipo: 'IDENTIFICADOR', lexema: 'x', linha: 1, coluna: 1 }, { tipo: 'OPERADOR_ATRIBUICAO', lexema: '=', linha: 1, coluna: 3 },
        { tipo: 'LITERAL_STRING', lexema: '"<img src=x onerror=alert(1)>"', linha: 1, coluna: 5 }, { tipo: 'QUEBRA_DE_LINHA', lexema: '\n', linha: 1, coluna: 35 }] } };
    const t = await analisarCom(null, { codigo, extra: { [codigo]: resposta } });
    expect(t.secao.querySelector('img')).toBeNull();
    expect(t.$('codigo-analisado').textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('Erro sintático', () => {
  it('bloco próprio com mensagem, explicação, encontrado, esperado e regra', async () => {
    const t = await analisarCom('erro-sintatico');
    expect(t.secao.dataset.resultado).toBe('erro-sintatico');
    const bloco = t.$('bloco-erro-sintatico');
    expect(bloco.querySelector('h3').textContent).toMatch(/Erro sintático \(fase 2/);
    expect(bloco.textContent).toMatch(/linha 2, coluna 14: era esperado identificador, número, string ou '\(', mas o parser encontrou o operador '\*'/);
    expect(bloco.textContent).toMatch(/dois operadores seguidos/);
    expect([...bloco.querySelectorAll('.chip')].map((c) => c.textContent)).toEqual(['identificador', 'número', 'string', '(']);
    expect(bloco.textContent).toMatch(/M\[TERMO, \*\] vazia/);
    expect(t.$('bloco-lexico-ok')).not.toBeNull();          // a fase léxica passou: distinção visível
    expect(t.resultados.textContent).toMatch(/erro sintático/);
  });

  it('o ponto do erro aparece marcado no código e na tabela de tokens', async () => {
    const t = await analisarCom('erro-sintatico');
    const marcado = t.$('codigo-analisado').querySelector('.tok.erro-sintatico');
    expect([marcado.textContent, marcado.dataset.l, marcado.dataset.c]).toEqual(['*', '2', '14']);
    expect(t.$('tabela-tokens').querySelector('tr.erro-sintatico').children[2].textContent).toBe('*');
    t.$('bloco-erro-sintatico').querySelector('button').click();       // Mostrar no código
    expect(t.destacados()).toEqual(['*']);
  });

  it('fim inesperado do código: marca no fim e explica o parêntese não fechado', async () => {
    const t = await analisarCom('erro-fim');
    expect(t.$('codigo-analisado').querySelector('.marca-fim').getAttribute('aria-label')).toBe('fim do código');
    expect(t.$('bloco-erro-sintatico').textContent).toMatch(/parêntese aberto na linha 1, coluna 5 não foi fechado/);
  });

  it('sem árvore final, mas o passo a passo mostra o que foi reconhecido antes do erro', async () => {
    const t = await analisarCom('erro-sintatico');
    expect(t.arvore.textContent).toMatch(/Não há árvore: o programa tem um erro sintático/);
    expect(t.$('btn-exportar').disabled).toBe(true);
    t.$('aba-passos').click();
    t.$('passo-fim').click();
    const parcial = t.$('arvore-parcial').textContent;
    expect(parcial).toMatch(/Atribuição: a/);
    expect(parcial).toMatch(/Identificador: b/);
    expect(t.$('passo-atual').textContent).toMatch(/Erro sintático na linha 2, coluna 14/);
  });

  it('"Selecionar no editor" seleciona o token do erro no campo de código', async () => {
    const t = await analisarCom('erro-sintatico');
    const botao = [...t.$('bloco-erro-sintatico').querySelectorAll('button')].find((b) => /editor/.test(b.textContent));
    botao.click();
    const area = t.area;
    expect(area.value.slice(area.selectionStart, area.selectionEnd)).toBe('*');
  });

  it('a tabela M marca com ✗ a célula vazia onde a análise falhou', async () => {
    const t = await analisarCom('erro-sintatico');
    [...t.$('bloco-erro-sintatico').querySelectorAll('button')].find((b) => /tabela M/.test(b.textContent)).click();
    await esperar(); await esperar();
    expect(t.$('aba-gramatica').getAttribute('aria-selected')).toBe('true');
    const celula = t.$('tabela-m').querySelector('td.celula-erro');
    expect([celula.dataset.nt, celula.dataset.t, celula.textContent]).toEqual(['TERMO', '*', '✗']);
    expect(t.$('legenda-tabela-m').textContent).toMatch(/M\[TERMO, \*\]/);
  });
});

describe('Erro léxico (decisão D1)', () => {
  it('mostra os erros léxicos e informa que a análise sintática não foi executada', async () => {
    const t = await analisarCom('erro-lexico');
    expect(t.secao.dataset.resultado).toBe('erro-lexico');
    const lex = t.$('bloco-erros-lexicos');
    expect(lex.querySelector('h3').textContent).toMatch(/Erros léxicos \(fase 1/);
    expect(lex.textContent).toMatch(/Linha 1, coluna 7:/);
    expect(t.$('bloco-sintatico-nao-executado').textContent).toMatch(/não foi executada porque há erros léxicos/);
    expect(t.$('bloco-erro-sintatico')).toBeNull();
    expect(t.$('codigo-analisado').querySelector('.erro-lexico').textContent).toBe('@');
    expect(t.arvore.textContent).toMatch(/não foi executada/);
    expect(t.$('passo-proximo').disabled).toBe(true);
    expect(t.resultados.textContent).toMatch(/erros léxicos; a análise sintática não foi executada/);
  });

  it('os tokens válidos continuam listados', async () => {
    const t = await analisarCom('erro-lexico');
    expect(t.$('tabela-tokens').querySelectorAll('tbody tr').length).toBe(fixture('erro-lexico').lexico.tokens.length);
  });
});

describe('Passo a passo do parser LL(1)', () => {
  it('navega pelos passos mostrando pilha, entrada, ação e célula da tabela M', async () => {
    const t = await analisarCom('valido');
    const passos = fixture('valido').sintatico.passos;
    t.$('aba-passos').click();
    expect(t.$('passo-rotulo').textContent).toBe(`Passo 1 de ${passos.length}`);
    expect(t.$('passo-atual').textContent).toMatch(/\$PROGRAMA/);
    t.$('passo-proximo').click();
    expect(t.$('passo-atual').textContent).toMatch(/M\[PROGRAMA, identificador\] = produção 1/);
    t.$('passo-fim').click();
    expect(t.$('passo-atual').textContent).toMatch(/a entrada foi aceita/);
    t.$('passo-anterior').click();
    expect(t.$('passo-rotulo').textContent).toBe(`Passo ${passos.length - 1} de ${passos.length}`);
    expect(t.$('tabela-passos').querySelectorAll('tbody tr').length).toBe(passos.length);
    expect(t.$('tabela-passos').querySelectorAll('tr.atual').length).toBe(1);
  });

  it('ao casar um token, ele é destacado no código', async () => {
    const t = await analisarCom('valido');
    const passos = fixture('valido').sintatico.passos;
    const k = passos.findIndex((p) => p.tipo === 'casar');
    t.$('tabela-passos').querySelector(`tr[data-k="${k}"]`).click();
    expect(t.destacados()).toEqual(['total']);
  });

  it('a árvore em construção cresce de baixo para cima', async () => {
    const t = await analisarCom('valido');
    t.$('aba-passos').click();
    expect(t.$('arvore-parcial').textContent).toMatch(/Nenhum nó criado ainda/);
    const passos = fixture('valido').sintatico.passos;
    const k = passos.findIndex((p) => p.no_criado && /MULTIPLICACAO|cria o nó da operação/.test(p.acao));
    t.Analise = t.w.Analise;
    t.w.Analise.irParaPasso(k);
    const parcial = t.$('arvore-parcial').textContent;
    expect(parcial).toMatch(/Multiplicação/);
    expect(parcial).not.toMatch(/Adição/);                  // a adição só é criada depois
    expect(t.$('arvore-parcial').querySelector('li.novo').textContent).toMatch(/Multiplicação/);
  });

  it('reproduzir avança sozinho e pausa', async () => {
    const fetchImpl = backendComFixtures();
    const t = await carregar({ fetchImpl, config: { intervaloReproducaoMs: 15 } });
    t.digitar(fixture('valido').codigo);
    await clicarAnalisar(t);
    const $ = (id) => t.d.getElementById(id);
    $('aba-passos').click();
    $('passo-reproduzir').click();
    expect($('passo-reproduzir').textContent).toMatch(/Pausar/);
    await new Promise((r) => setTimeout(r, 120));
    $('passo-reproduzir').click();                          // pausa
    const parado = t.w.Analise.estado().passo;
    expect(parado).toBeGreaterThan(1);
    expect($('passo-reproduzir').textContent).toMatch(/Reproduzir/);
    await new Promise((r) => setTimeout(r, 80));
    expect(t.w.Analise.estado().passo).toBe(parado);
  });
});

describe('Gramática e tabela M', () => {
  it('carrega a gramática ao abrir a aba e mostra produções, FIRST/FOLLOW e M', async () => {
    const t = await analisarCom('valido');
    expect(t.fetchImpl.urls).not.toContain('/api/gramatica');      // só carrega quando necessário
    t.$('aba-gramatica').click();
    await esperar(); await esperar();
    expect(t.fetchImpl.urls).toContain('/api/gramatica');
    const painel = t.$('painel-gramatica');
    expect(painel.querySelectorAll('.producoes li').length).toBe(16);
    expect(painel.textContent).toMatch(/FATOR → \( EXPR \)/);
    const celula = [...t.$('tabela-m').querySelectorAll('td')].find((c) => c.dataset.nt === 'FATOR' && c.dataset.t === '(');
    expect(celula.textContent).toBe('16');
    expect(celula.title).toBe('M[FATOR, (] = FATOR → ( EXPR )');
  });

  it('falha ao carregar a gramática não quebra a interface', async () => {
    const t = await carregar({ fetchImpl: (url, op) => {
      if (url === '/api/gramatica') return Promise.reject(new TypeError('rede'));
      return backendComFixtures()(url, op);
    } });
    t.digitar(fixture('valido').codigo);
    await clicarAnalisar(t);
    t.d.getElementById('aba-gramatica').click();
    await esperar(); await esperar();
    expect(t.d.getElementById('conteudo-gramatica').textContent).toMatch(/Não foi possível carregar a gramática/);
  });

  it('abas acessíveis: setas trocam de aba e só um painel fica visível', async () => {
    const t = await analisarCom('valido');
    const aba = t.$('aba-arvore');
    aba.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(t.$('aba-tokens').getAttribute('aria-selected')).toBe('true');
    const visiveis = ['painel-arvore', 'painel-tokens', 'painel-passos', 'painel-gramatica'].filter((id) => !t.$(id).hidden);
    expect(visiveis).toEqual(['painel-tokens']);
  });
});

describe('Integração com o restante da interface', () => {
  it('trocar de exemplo e Limpar escondem a análise anterior', async () => {
    const t = await analisarCom('valido');
    t.escolher('atribuicao-simples');
    expect(t.secao.hidden).toBe(true);
    expect(t.$('erros-analise').children.length).toBe(0);
    t.digitar(fixture('valido').codigo);
    await clicarAnalisar(t);
    expect(t.secao.hidden).toBe(false);
    t.limpar.click();
    expect(t.secao.hidden).toBe(true);
  });

  it('falha de comunicação não mostra análise antiga', async () => {
    let n = 0;
    const base = backendComFixtures();
    const t = await carregar({ fetchImpl: (u, o) => (u === '/api/analisar' && ++n === 2 ? Promise.reject(new TypeError('x')) : base(u, o)) });
    t.digitar(fixture('valido').codigo);
    await clicarAnalisar(t);
    expect(t.d.getElementById('secao-analise').hidden).toBe(false);
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.d.getElementById('secao-analise').hidden).toBe(true);
  });

  it('programa só com comentário: válido, sem tokens, AST vazia', async () => {
    const t = await analisarCom('comentario');
    expect(t.secao.dataset.resultado).toBe('valido');
    expect(t.$('tabela-tokens').textContent).toMatch(/Nenhum token/);
    expect(t.arvore.textContent).toMatch(/Programa \(0 atribuições\)/);
  });

  it('programa grande: a tabela e o destaque são limitados e a interface não quebra', async () => {
    const tokens = [];
    for (let l = 1; l <= 2000; l++) {
      tokens.push({ tipo: 'IDENTIFICADOR', lexema: 'a', linha: l, coluna: 1 }, { tipo: 'OPERADOR_ATRIBUICAO', lexema: '=', linha: l, coluna: 3 },
        { tipo: 'LITERAL_INTEIRO', lexema: '1', linha: l, coluna: 5 }, { tipo: 'QUEBRA_DE_LINHA', lexema: '\n', linha: l, coluna: 6 });
    }
    const codigo = 'a = 1\n'.repeat(2000);
    const resposta = { recebido: true, mensagem: 'Código recebido com sucesso.', codigo,
      estatisticas: { linhas: 2000, caracteres: codigo.length, bytes: codigo.length },
      ...analiseMinima(), lexico: { sucesso: true, tokens, erros: [] } };
    const t = await analisarCom(null, { codigo, extra: { [codigo]: resposta } });
    expect(t.$('tabela-tokens').querySelectorAll('tbody tr').length).toBe(3000);
    expect(t.$('aviso-tokens').textContent).toMatch(/primeiros 3000 de 8000/);
    expect(t.$('aviso-codigo').textContent).toMatch(/destaque por token foi desativado/);
    expect(t.$('codigo-analisado').textContent).toBe(codigo);
  });
});
