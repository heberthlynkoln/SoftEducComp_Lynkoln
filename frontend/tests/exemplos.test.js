import { describe, it, expect } from 'vitest';
import { carregar, esperar, clicarAnalisar, sucessoApi } from './helpers.js';

// Conteúdo esperado de cada exemplo, escrito aqui de propósito: se alguém alterar um
// exemplo sem querer, o teste correspondente falha.
const ESPERADOS = [
  { id: 'atribuicao-simples', valido: true, codigo: 'x = 5\n' },
  { id: 'operacao-aritmetica', valido: true, codigo: 'resultado = 10 + 5\n' },
  { id: 'expressao-parenteses', valido: true, codigo: 'total = 2 + 3 * 4\nmedia = (2 + 3) * 4 / 2 - 1\n' },
  { id: 'variaveis-encadeadas', valido: true, codigo: 'preco = 10\nqtd = 3\ntotal = preco * (qtd + 1)\n' },
  { id: 'strings', valido: true, codigo: 'nome = "Ana"\nsaudacao = "Olá, " + nome\n' },
  { id: 'erro-operando-ausente', valido: false, codigo: 'x = 5 +\ny = 2\n' },
  { id: 'erro-sem-expressao', valido: false, codigo: 'x =\n' },
  { id: 'erro-parenteses', valido: false, codigo: 'total = preco * (qtd + 1\n' },
  { id: 'erro-sem-igual', valido: false, codigo: 'x 5\n' },
  { id: 'erro-fora-do-escopo', valido: false, codigo: 'x = 5\nif x > 3:\n    y = 1\n' },
];

// Validador mínimo da gramática do README (descida recursiva), só para conferir
// que os exemplos "válidos" pertencem ao subconjunto e os "com erro" realmente não.
function pertenceAoSubconjunto(codigo) {
  const re = /[ \t\r]*(?:([A-Za-z_]\w*)|(\d+(?:\.\d+)?)|("[^"\n]*")|([=+\-*/()])|(\n)|(.))/gy;
  const toks = [];
  let m;
  while (re.lastIndex < codigo.length && (m = re.exec(codigo))) {
    if (m[6] !== undefined) return false;                  // caractere desconhecido
    if (m[1] !== undefined) toks.push(['id', m[1]]);
    else if (m[2] !== undefined) toks.push(['num']);
    else if (m[3] !== undefined) toks.push(['str']);
    else if (m[4] !== undefined) toks.push([m[4]]);
    else if (m[5] !== undefined) toks.push(['nl']);
  }
  const palavrasReservadas = ['if', 'while', 'for', 'def', 'class', 'import'];
  if (toks.some((t) => t[0] === 'id' && palavrasReservadas.includes(t[1]))) return false;
  let i = 0;
  const t = () => (toks[i] ? toks[i][0] : null);
  function expr() { if (!termo()) return false; while (t() === '+' || t() === '-') { i++; if (!termo()) return false; } return true; }
  function termo() { if (!fator()) return false; while (t() === '*' || t() === '/') { i++; if (!fator()) return false; } return true; }
  function fator() {
    if (['id', 'num', 'str'].includes(t())) { i++; return true; }
    if (t() === '(') { i++; if (!expr()) return false; if (t() !== ')') return false; i++; return true; }
    return false;
  }
  while (i < toks.length) {
    if (t() === 'nl') { i++; continue; }
    if (t() !== 'id') return false; i++;
    if (t() !== '=') return false; i++;
    if (!expr()) return false;
    if (i < toks.length && t() !== 'nl') return false;
  }
  return true;
}

describe('Catálogo de exemplos', () => {
  it('há pelo menos três exemplos válidos e pelo menos um com erro', async () => {
    const { w } = await carregar();
    expect(w.EXEMPLOS.filter((e) => e.valido).length).toBeGreaterThanOrEqual(3);
    expect(w.EXEMPLOS.filter((e) => !e.valido).length).toBeGreaterThanOrEqual(1);
  });

  it('o catálogo contém exatamente os exemplos esperados, na ordem esperada', async () => {
    const { w } = await carregar();
    expect(w.EXEMPLOS.map((e) => e.id)).toEqual(ESPERADOS.map((e) => e.id));
  });

  it('todo exemplo tem título, descrição e construções demonstradas', async () => {
    const { w } = await carregar();
    w.EXEMPLOS.forEach((e) => {
      expect(e.titulo.trim(), e.id).not.toBe('');
      expect(e.descricao.trim(), e.id).not.toBe('');
      expect(e.demonstra.trim(), e.id).not.toBe('');
    });
  });

  it('o seletor agrupa válidos e com erro, cada exemplo em seu grupo', async () => {
    const { w, seletor } = await carregar();
    const grupos = [...seletor.querySelectorAll('optgroup')];
    expect(grupos.map((g) => g.label)).toEqual(['Programas válidos', 'Programas com erro intencional']);
    const idsGrupo = (g) => [...g.querySelectorAll('option')].map((o) => o.value);
    expect(idsGrupo(grupos[0])).toEqual(w.EXEMPLOS.filter((e) => e.valido).map((e) => e.id));
    expect(idsGrupo(grupos[1])).toEqual(w.EXEMPLOS.filter((e) => !e.valido).map((e) => e.id));
  });

  it('a primeira opção é um convite à seleção, sem código associado', async () => {
    const { seletor } = await carregar();
    expect(seletor.options[0].value).toBe('');
    expect(seletor.options[0].textContent).toMatch(/Selecione/);
  });
});

describe('Exemplos e o subconjunto da linguagem', () => {
  it.each(ESPERADOS.filter((e) => e.valido))('$id pertence ao subconjunto', ({ codigo }) => {
    expect(pertenceAoSubconjunto(codigo)).toBe(true);
  });

  it.each(ESPERADOS.filter((e) => !e.valido))('$id realmente contém um erro', ({ codigo }) => {
    expect(pertenceAoSubconjunto(codigo)).toBe(false);
  });

  it('o validador de teste distingue entradas conhecidas (sanidade)', () => {
    expect(pertenceAoSubconjunto('')).toBe(true);
    expect(pertenceAoSubconjunto('a = (1 + 2) * b')).toBe(true);
    expect(pertenceAoSubconjunto('a = (1 + 2')).toBe(false);
    expect(pertenceAoSubconjunto('a = 1 2')).toBe(false);
    expect(pertenceAoSubconjunto('a = 1 $ 2')).toBe(false);
    expect(pertenceAoSubconjunto('a = 1\nb = 2\n')).toBe(true);
    expect(pertenceAoSubconjunto('a = 1 +\nb = 2')).toBe(false);
    expect(pertenceAoSubconjunto('a =\nb = 2')).toBe(false);
  });
});

describe('Seleção de cada exemplo', () => {
  it.each(ESPERADOS)('$id: carrega o código esperado, com descrição e construções', async ({ id, codigo }) => {
    const t = await carregar();
    t.escolher(id);
    const ex = t.w.EXEMPLOS.find((e) => e.id === id);
    expect(t.area.value).toBe(codigo);
    expect(t.d.getElementById('descricao-exemplo').textContent).toBe(ex.descricao);
    expect(t.d.getElementById('construcoes-exemplo').textContent).toBe(`Demonstra: ${ex.demonstra}`);
    expect(t.seletor.value).toBe(id);
  });

  it.each(ESPERADOS)('$id: o contador reflete o código carregado', async ({ id, codigo }) => {
    const t = await carregar();
    t.escolher(id);
    const linhas = codigo.replace(/\n$/, '').split('\n').length;
    expect(t.d.getElementById('contador').textContent)
      .toBe(`${linhas} ${linhas === 1 ? 'linha' : 'linhas'} · ${codigo.length} caracteres`);
  });

  it.each(ESPERADOS)('$id: pode ser editado e o texto editado é o enviado', async ({ id, codigo }) => {
    const t = await carregar();
    t.escolher(id);
    t.digitar(codigo + 'extra = 1\n');
    await clicarAnalisar(t);
    expect(JSON.parse(t.chamadas[0].opcoes.body).codigo).toBe(codigo + 'extra = 1\n');
  });

  it.each(ESPERADOS)('$id: o código é enviado exatamente como carregado', async ({ id, codigo }) => {
    const t = await carregar();
    t.escolher(id);
    await clicarAnalisar(t);
    expect(JSON.parse(t.chamadas[0].opcoes.body).codigo).toBe(codigo);
    expect(t.resultados.dataset.estado).toBe('info');
  });
});

describe('Seleção substitui o conteúdo anterior', () => {
  it('substitui o código inicial da página', async () => {
    const t = await carregar();
    const inicial = t.area.value;
    t.escolher('strings');
    expect(t.area.value).not.toBe(inicial);
    expect(t.area.value).toBe(ESPERADOS.find((e) => e.id === 'strings').codigo);
  });

  it('substitui um texto digitado pelo usuário, sem misturar', async () => {
    const t = await carregar();
    t.digitar('meu = "codigo"\nfoo = bar');
    t.escolher('atribuicao-simples');
    expect(t.area.value).toBe('x = 5\n');
  });

  it('substitui um exemplo anterior por outro, em qualquer ordem', async () => {
    const t = await carregar();
    for (const e of [ESPERADOS[4], ESPERADOS[0], ESPERADOS[9], ESPERADOS[2]]) {
      t.escolher(e.id);
      expect(t.area.value).toBe(e.codigo);
      expect(t.seletor.value).toBe(e.id);
    }
  });

  it('a descrição e as construções acompanham o exemplo mais recente', async () => {
    const t = await carregar();
    t.escolher('strings');
    t.escolher('erro-parenteses');
    const ex = t.w.EXEMPLOS.find((e) => e.id === 'erro-parenteses');
    expect(t.d.getElementById('descricao-exemplo').textContent).toBe(ex.descricao);
    expect(t.d.getElementById('construcoes-exemplo').textContent).toBe(`Demonstra: ${ex.demonstra}`);
  });

  it('voltar à opção "Selecione…" não apaga nem altera o código', async () => {
    const t = await carregar();
    t.escolher('strings');
    t.escolher('');
    expect(t.area.value).toBe(ESPERADOS[4].codigo);
    expect(t.d.getElementById('descricao-exemplo').textContent).toBe('');
    expect(t.d.getElementById('construcoes-exemplo').textContent).toBe('');
  });

  it('um id desconhecido não altera o código', async () => {
    const t = await carregar();
    t.digitar('a = 1');
    t.seletor.value = 'nao-existe';
    t.seletor.dispatchEvent(new t.w.Event('change'));
    expect(t.area.value).toBe('a = 1');
  });
});

describe('Editar depois de selecionar', () => {
  it('editar o exemplo devolve o seletor ao início e avisa o usuário', async () => {
    const t = await carregar();
    t.escolher('operacao-aritmetica');
    t.digitar('resultado = 10 + 6\n');
    expect(t.seletor.value).toBe('');
    expect(t.d.getElementById('descricao-exemplo').textContent).toMatch(/editou o exemplo "Operação aritmética"/);
    expect(t.d.getElementById('construcoes-exemplo').textContent).toMatch(/^Demonstra:/);
  });

  it('é possível selecionar de novo o mesmo exemplo para restaurá-lo', async () => {
    const t = await carregar();
    t.escolher('operacao-aritmetica');
    t.digitar('lixo');
    t.escolher('operacao-aritmetica');
    expect(t.area.value).toBe('resultado = 10 + 5\n');
    expect(t.d.getElementById('descricao-exemplo').textContent)
      .toBe(t.w.EXEMPLOS.find((e) => e.id === 'operacao-aritmetica').descricao);
  });

  it('digitar um texto igual ao original não é tratado como edição', async () => {
    const t = await carregar();
    t.escolher('atribuicao-simples');
    t.digitar('x = 5\n');
    expect(t.seletor.value).toBe('atribuicao-simples');
  });

  it('editar um texto que não veio de exemplo não exibe aviso de exemplo', async () => {
    const t = await carregar();
    t.digitar('a = 1');
    expect(t.d.getElementById('descricao-exemplo').textContent).toBe('');
  });
});

describe('A seleção não interfere em outras funcionalidades', () => {
  it('selecionar não envia nada ao backend', async () => {
    const t = await carregar();
    t.escolher('strings');
    await esperar();
    expect(t.chamadas.length).toBe(0);
  });

  it('selecionar limpa o resultado de uma análise anterior', async () => {
    const t = await carregar();
    t.digitar('a = 1');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('info');
    t.escolher('strings');
    expect(t.resultados.dataset.estado).toBe('inicial');
  });

  it('selecionar limpa também uma mensagem de validação', async () => {
    const t = await carregar();
    t.digitar('');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    t.escolher('strings');
    expect(t.resultados.dataset.estado).toBe('inicial');
  });

  it('Analisar funciona após selecionar vários exemplos seguidos', async () => {
    const t = await carregar();
    t.escolher('strings');
    t.escolher('erro-sem-igual');
    await clicarAnalisar(t);
    expect(t.chamadas.length).toBe(1);
    expect(JSON.parse(t.chamadas[0].opcoes.body).codigo).toBe('x 5\n');
  });

  it('Limpar após selecionar apaga código, seletor, descrição e construções', async () => {
    const t = await carregar();
    t.escolher('strings');
    t.limpar.click();
    expect(t.area.value).toBe('');
    expect(t.seletor.value).toBe('');
    expect(t.d.getElementById('descricao-exemplo').textContent).toBe('');
    expect(t.d.getElementById('construcoes-exemplo').textContent).toBe('');
  });

  it('depois de Limpar, selecionar o mesmo exemplo volta a preencher o editor', async () => {
    const t = await carregar();
    t.escolher('strings');
    t.limpar.click();
    t.escolher('strings');
    expect(t.area.value).toBe(ESPERADOS[4].codigo);
  });

  it('o exemplo selecionado é preservado ao recarregar a página', async () => {
    const t1 = await carregar();
    t1.escolher('variaveis-encadeadas');
    const t2 = await carregar({ armazenamento: t1.armazenamento });
    expect(t2.area.value).toBe(ESPERADOS[3].codigo);
  });

  it('o botão Analisar permanece habilitado após selecionar', async () => {
    const t = await carregar();
    t.escolher('strings');
    expect(t.analisar.disabled).toBe(false);
  });

  it('selecionar durante um envio pendente descarta a resposta antiga', async () => {
    let liberar;
    const t = await carregar({
      fetchImpl: (url) => url === '/api/health'
        ? Promise.resolve({ ok: true, json: async () => ({}) })
        : new Promise((res) => { liberar = () => res({ ok: true, json: async () => sucessoApi('a = 1') }); }),
    });
    t.digitar('a = 1');
    t.analisar.click();
    await esperar();
    t.escolher('strings');
    liberar(); await esperar(); await esperar();
    expect(t.resultados.dataset.estado).toBe('inicial');
    expect(t.analisar.disabled).toBe(false);
    expect(t.area.value).toBe(ESPERADOS[4].codigo);
  });

  it('o indicador de backend não muda ao selecionar exemplos', async () => {
    const t = await carregar();
    await esperar();
    const antes = t.d.getElementById('status-backend').textContent;
    t.escolher('strings');
    expect(t.d.getElementById('status-backend').textContent).toBe(antes);
  });

  it('o código de um exemplo aparece como texto no eco, sem HTML interpretado', async () => {
    const t = await carregar();
    t.escolher('erro-fora-do-escopo');
    await clicarAnalisar(t);
    expect(t.d.getElementById('eco-codigo').textContent).toBe('x = 5\nif x > 3:\n    y = 1\n');
  });
});
