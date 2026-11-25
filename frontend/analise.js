// Exibição da análise léxica e sintática (seção 3 da tela e blocos de erro da seção 2).
// Recebe o JSON de POST /api/analisar (docs/API.md) e monta:
//   * blocos de erro separados por fase (léxico / sintático), com posição e explicação;
//   * o código analisado com os tokens destacados por categoria;
//   * a AST como árvore navegável (expandir/recolher, teclado, destaque do trecho no código);
//   * a tabela de tokens, o passo a passo do parser LL(1) e a gramática com a tabela M.
// Todo texto vindo do código do usuário entra no DOM por textContent (nunca como HTML).
(function () {
  const LIMITE_TOKENS_TABELA = 3000;   // linhas da tabela de tokens
  const LIMITE_TOKENS_DESTAQUE = 6000; // acima disso o código é mostrado sem destaque
  const LIMITE_NOS_EXPANDIR = 1500;    // "Expandir tudo" e filtro não abrem mais que isso
  const LIMITE_NOS_PARCIAL = 400;      // nós mostrados na árvore em construção
  const EXPANDIR_TUDO_ATE = 150;       // árvores pequenas abrem totalmente
  const INTERVALO_REPRODUCAO_MS = 700;

  const CATEGORIAS = {
    PALAVRA_RESERVADA: 'Palavra reservada',
    IDENTIFICADOR: 'Identificador',
    LITERAL_INTEIRO: 'Número inteiro',
    LITERAL_REAL: 'Número real',
    LITERAL_STRING: 'String',
    OPERADOR_ARITMETICO: 'Operador aritmético',
    OPERADOR_ATRIBUICAO: 'Operador de atribuição',
    OPERADOR_RELACIONAL: 'Operador relacional',
    DELIMITADOR: 'Delimitador',
    QUEBRA_DE_LINHA: 'Quebra de linha',
  };

  // Forma de cada tipo de nó: a categoria não depende só da cor.
  const FORMAS = {
    PROGRAMA: '▣', ATRIBUICAO: '■', IDENTIFICADOR: '▲', NUMERO: '●', TEXTO: '❝',
    ADICAO: '◆', SUBTRACAO: '◆', MULTIPLICACAO: '◆', DIVISAO: '◆', AGRUPAMENTO: '( )',
  };

  const $ = (id) => document.getElementById(id);
  const cp = (s) => Array.from(s);                       // pontos de código, como o backend
  const linhasDe = (t) => t.split(/\r\n|\r|\n/);

  function el(tag, props, ...filhos) {
    const e = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'dataset') Object.assign(e.dataset, v);
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const f of filhos) if (f !== null && f !== undefined) e.append(f);
    return e;
  }

  const rolar = (e) => { if (e && e.scrollIntoView) e.scrollIntoView({ block: 'nearest' }); };
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const antes = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);   // a <= b

  function fimToken(t) {
    if (t.tipo === 'QUEBRA_DE_LINHA') return [t.linha, t.coluna];
    return [t.linha, t.coluna + cp(t.lexema).length - 1];
  }

  function descreverPosicao(l, c, lf, cf) {
    if (l === lf && c === cf) return `linha ${l}, coluna ${c}`;
    if (l === lf) return `linha ${l}, colunas ${c} a ${cf}`;
    return `linha ${l}, coluna ${c} até linha ${lf}, coluna ${cf}`;
  }

  function lexemaVisivel(t) {
    if (t.tipo === 'QUEBRA_DE_LINHA') return '⏎ (quebra de linha)';
    return t.lexema;
  }

  // ------------------------------------------------------------------ estado
  const estado = {
    dados: null, indice: new Map(), criadoNoPasso: new Map(), selecionado: null,
    passo: 0, temporizador: null, gramatica: null, carregandoGramatica: null,
  };

  // ------------------------------------------------------------------ resumo e erros (seção 2)
  function renderizarErros(d) {
    const alvo = $('erros-analise');
    alvo.replaceChildren();
    const lex = d.lexico;
    const sin = d.sintatico;

    if (lex.erros.length) {
      const lista = el('ol', { class: 'lista-erros' });
      lex.erros.forEach((e) => {
        lista.append(el('li', null,
          el('strong', { text: `Linha ${e.linha}, coluna ${e.coluna}: ` }), e.mensagem, ' ',
          el('span', { class: 'ajuda', text: `Trecho: ${e.lexema || '(vazio)'}` }), ' ',
          el('button', {
            type: 'button', class: 'link', text: 'Mostrar no código',
            onclick: () => destacarErroLexico(e),
          })));
      });
      alvo.append(el('section', { class: 'bloco bloco-erro', id: 'bloco-erros-lexicos', 'aria-labelledby': 'tit-lex' },
        el('h3', { id: 'tit-lex', text: '✖ Erros léxicos (fase 1: análise léxica)' }),
        el('p', { text: `O scanner encontrou ${plural(lex.erros.length, 'erro', 'erros')}: há trechos que não formam nenhum token da linguagem.` }),
        lista));
    } else {
      alvo.append(el('p', { class: 'bloco bloco-ok', id: 'bloco-lexico-ok',
        text: `✔ Análise léxica: ${plural(lex.tokens.length, 'token', 'tokens')}, sem erros.` }));
    }

    if (!sin.executado) {
      alvo.append(el('section', { class: 'bloco bloco-aviso', id: 'bloco-sintatico-nao-executado', 'aria-labelledby': 'tit-nex' },
        el('h3', { id: 'tit-nex', text: '⚠ Análise sintática não executada' }),
        el('p', { text: sin.motivo || 'A análise sintática não foi executada porque há erros léxicos.' })));
    } else if (sin.erros.length) {
      const e = sin.erros[0];
      const detalhes = el('dl', { class: 'dl-erro' },
        el('dt', { text: 'Encontrado' }), el('dd', null, el('code', { text: e.encontrado })),
        el('dt', { text: 'Esperado' }),
        el('dd', null, ...e.esperado.flatMap((x, i) => [i ? ' ' : '', el('code', { class: 'chip', text: x })])));
      if (e.regra) detalhes.append(el('dt', { text: 'Regra' }), el('dd', null, el('code', { text: e.regra })));
      if (e.celula_tabela) {
        detalhes.append(el('dt', { text: 'Tabela M' }),
          el('dd', { text: `célula M[${e.celula_tabela.nao_terminal}, ${e.celula_tabela.terminal}] vazia` }));
      }
      const acoes = el('div', { class: 'acoes' },
        el('button', { type: 'button', class: 'secundario', text: 'Mostrar no código', onclick: () => destacarErroSintatico(e) }),
        el('button', { type: 'button', class: 'secundario', text: 'Selecionar no editor', onclick: () => selecionarNoEditor(e) }));
      if (e.celula_tabela) {
        acoes.append(el('button', { type: 'button', class: 'secundario', text: 'Ver na tabela M',
          onclick: () => { ativarAba('aba-gramatica'); } }));
      }
      alvo.append(el('section', { class: 'bloco bloco-erro', id: 'bloco-erro-sintatico', 'aria-labelledby': 'tit-sin' },
        el('h3', { id: 'tit-sin', text: '✖ Erro sintático (fase 2: análise sintática)' }),
        el('p', { class: 'mensagem-erro', text: e.mensagem }),
        el('p', { class: 'explicacao-erro', text: e.explicacao }),
        detalhes, acoes,
        el('p', { class: 'ajuda', text: 'O parser para no primeiro erro sintático (não há recuperação de erros): corrija-o e analise de novo.' })));
    } else {
      const est = sin.estatisticas || {};
      const n = sin.ast ? sin.ast.atributos.quantidade_atribuicoes : null;
      const partes = [`✔ Análise sintática: programa válido`];
      if (n !== null) partes.push(plural(n, 'atribuição', 'atribuições'));
      if (est.nos) partes.push(`AST com ${plural(est.nos, 'nó', 'nós')} e profundidade ${est.profundidade}`);
      alvo.append(el('p', { class: 'bloco bloco-ok', id: 'bloco-sintatico-ok', text: partes.join('; ') + '.' }));
    }
    (sin.avisos || []).forEach((a) => alvo.append(el('p', { class: 'bloco bloco-aviso', text: `⚠ ${a}` })));
  }

  // ------------------------------------------------------------------ código analisado
  function renderizarCodigo(d) {
    const pre = $('codigo-analisado');
    const aviso = $('aviso-codigo');
    pre.replaceChildren();
    aviso.hidden = true;
    if (d.lexico.tokens.length > LIMITE_TOKENS_DESTAQUE) {
      pre.textContent = d.codigo;
      aviso.hidden = false;
      aviso.textContent = `O destaque por token foi desativado: o programa tem mais de ${LIMITE_TOKENS_DESTAQUE} tokens.`;
      return;
    }
    const itens = [];
    d.lexico.tokens.forEach((t, i) => {
      if (t.tipo !== 'QUEBRA_DE_LINHA') itens.push({ l: t.linha, c: t.coluna, n: cp(t.lexema).length, tok: t, i });
    });
    d.lexico.erros.forEach((e) => itens.push({ l: e.linha, c: e.coluna, n: Math.max(cp(e.lexema).length, 1), erro: e }));
    itens.sort((a, b) => a.l - b.l || a.c - b.c);

    const errSin = d.sintatico.erros[0];
    const indiceErro = errSin && errSin.token !== null && errSin.token !== undefined ? errSin.token : null;
    const tokErro = indiceErro !== null ? d.lexico.tokens[indiceErro] : null;
    const marcaFim = errSin && (tokErro === null || tokErro.tipo === 'QUEBRA_DE_LINHA');

    const linhas = linhasDe(d.codigo);
    let k = 0;
    linhas.forEach((linha, idx) => {
      const nl = idx + 1;
      const chars = cp(linha);
      let col = 1;
      const lacuna = (ate) => {
        if (ate <= col) return;
        const texto = chars.slice(col - 1, ate - 1).join('');
        const p = texto.indexOf('#');
        if (p >= 0) {
          if (p > 0) pre.append(el('span', { class: 'lacuna', dataset: { l: nl, c: col, cf: col + p - 1 }, text: texto.slice(0, p) }));
          pre.append(el('span', { class: 'comentario', title: 'Comentário (descartado pelo scanner)', text: texto.slice(p) }));
        } else {
          pre.append(el('span', { class: 'lacuna', dataset: { l: nl, c: col, cf: ate - 1 }, text: texto }));
        }
        col = ate;
      };
      while (k < itens.length && itens[k].l === nl) {
        const it = itens[k++];
        if (it.c < col) continue;
        lacuna(it.c);
        const texto = chars.slice(it.c - 1, it.c - 1 + it.n).join('');
        if (it.tok) {
          const span = el('span', {
            class: `tok cat-${it.tok.tipo}` + (it.i === indiceErro ? ' erro-sintatico' : ''),
            dataset: { i: it.i, l: nl, c: it.c, cf: it.c + it.n - 1 },
            title: `${CATEGORIAS[it.tok.tipo] || it.tok.tipo} (${it.tok.tipo}) — linha ${nl}, coluna ${it.c}`,
            text: texto,
          });
          pre.append(span);
        } else {
          pre.append(el('span', {
            class: 'erro-lexico', dataset: { l: nl, c: it.c, cf: it.c + it.n - 1 },
            title: `Erro léxico: ${it.erro.mensagem}`, text: texto || ' ',
          }));
        }
        col = it.c + it.n;
      }
      lacuna(chars.length + 1);
      if (marcaFim && errSin.linha === nl) {
        const fimCod = errSin.encontrado === 'fim do código';
        pre.append(el('span', {
          class: 'marca-fim erro-sintatico', dataset: { l: nl, c: errSin.coluna, cf: errSin.coluna },
          title: fimCod ? 'Fim do código: aqui o parser ainda esperava mais tokens' : 'Fim da linha: aqui o parser esperava outro token',
          'aria-label': fimCod ? 'fim do código' : 'fim da linha', text: fimCod ? '∎' : '⏎',
        }));
      }
      if (idx < linhas.length - 1) pre.append('\n');
    });
  }

  function renderizarLegenda(d) {
    const presentes = new Set(d.lexico.tokens.map((t) => t.tipo));
    const leg = $('legenda-categorias');
    leg.replaceChildren();
    Object.entries(CATEGORIAS).forEach(([tipo, nome]) => {
      if (presentes.has(tipo) && tipo !== 'QUEBRA_DE_LINHA') leg.append(el('span', { class: `tok cat-${tipo}`, text: nome }), ' ');
    });
    if (d.lexico.erros.length) leg.append(el('span', { class: 'erro-lexico', text: 'Erro léxico' }), ' ');
    if (d.sintatico.erros.length) leg.append(el('span', { class: 'erro-sintatico', text: 'Ponto do erro sintático' }));
  }

  function limparDestaques() {
    document.querySelectorAll('#codigo-analisado .destaque, #tabela-tokens .destaque, #arvore .relacionado')
      .forEach((e) => e.classList.remove('destaque', 'relacionado'));
  }

  // Destaca no código (e na tabela de tokens) o intervalo [ini, fim], inclusivo.
  function destacar(ini, fim) {
    limparDestaques();
    let primeiro = null;
    document.querySelectorAll('#codigo-analisado [data-l]').forEach((s) => {
      const l = Number(s.dataset.l);
      const a = [l, Number(s.dataset.c)];
      const b = [l, Number(s.dataset.cf)];
      if (antes(ini, a) && antes(b, fim)) {
        s.classList.add('destaque');
        if (!primeiro) primeiro = s;
      }
    });
    document.querySelectorAll('#tabela-tokens tbody tr[data-i]').forEach((tr) => {
      const t = estado.dados.lexico.tokens[Number(tr.dataset.i)];
      if (t && antes(ini, [t.linha, t.coluna]) && antes(fimToken(t), fim)) tr.classList.add('destaque');
    });
    rolar(primeiro);
    return primeiro;
  }

  function trecho(ini, fim) {
    const linhas = linhasDe(estado.dados.codigo);
    const partes = [];
    for (let l = ini[0]; l <= fim[0] && l <= linhas.length; l++) {
      const chars = cp(linhas[l - 1]);
      const c0 = l === ini[0] ? ini[1] : 1;
      const c1 = l === fim[0] ? fim[1] : chars.length;
      partes.push(chars.slice(c0 - 1, c1).join(''));
    }
    return partes.join('\n');
  }

  function mostrarDetalhes(titulo, linhas) {
    const box = $('detalhes-selecao');
    const dl = el('dl');
    linhas.forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') dl.append(el('dt', { text: k }), el('dd', null, v)); });
    box.replaceChildren(el('h3', { text: titulo }), dl);
  }

  function destacarErroLexico(e) {
    const n = Math.max(cp(e.lexema).length, 1);
    destacar([e.linha, e.coluna], [e.linha, e.coluna + n - 1]);
    mostrarDetalhes('Erro léxico', [['Código', e.codigo], ['Posição', descreverPosicao(e.linha, e.coluna, e.linha, e.coluna + n - 1)],
      ['Trecho', el('code', { text: e.lexema })], ['Mensagem', e.mensagem]]);
  }

  function destacarErroSintatico(e) {
    destacar([e.linha, e.coluna], [e.linha_fim, e.coluna_fim]);
    mostrarDetalhes('Erro sintático', [['Posição', descreverPosicao(e.linha, e.coluna, e.linha_fim, e.coluna_fim)],
      ['Encontrado', el('code', { text: e.encontrado })], ['Esperado', e.esperado.join(', ')], ['Regra', e.regra]]);
  }

  // Seleciona o trecho no editor (só se o editor ainda tem exatamente o código analisado).
  function indiceUtf16(texto, linha, coluna) {
    const re = /\r\n|\r|\n/g;
    let inicio = 0;
    for (let l = 1; l < linha; l++) {
      const m = re.exec(texto);
      if (!m) return texto.length;
      inicio = m.index + m[0].length;
    }
    const resto = texto.slice(inicio);
    const cps = cp(resto).slice(0, coluna - 1).join('');
    return inicio + cps.length;
  }

  function selecionarNoEditor(e) {
    const area = $('codigo');
    const info = $('info-arvore');
    if (area.value !== estado.dados.codigo) {
      mostrarDetalhes('Editor alterado', [['Aviso', 'O código do editor mudou desde a análise. Analise de novo para localizar o erro.']]);
      return;
    }
    const a = indiceUtf16(area.value, e.linha, e.coluna);
    const b = Math.max(indiceUtf16(area.value, e.linha_fim, e.coluna_fim + 1), a + (e.encontrado === 'fim do código' ? 0 : 1));
    area.focus();
    area.setSelectionRange(a, Math.min(b, area.value.length));
    if (info) info.textContent = '';
  }

  // ------------------------------------------------------------------ AST
  function construirIndice(raizes) {
    estado.indice = new Map();
    const pilha = raizes.map((r) => [r, null, 1]);
    while (pilha.length) {
      const [no, pai, nivel] = pilha.pop();
      estado.indice.set(no.id, { no, pai, nivel });
      no.filhos.forEach((f) => pilha.push([f, no.id, nivel + 1]));
    }
  }

  function rotuloNo(no) {
    const a = no.atributos || {};
    switch (no.tipo) {
      case 'PROGRAMA': return `Programa (${plural(a.quantidade_atribuicoes, 'atribuição', 'atribuições')})`;
      case 'ATRIBUICAO': return `Atribuição: ${a.nome} = …`;
      case 'IDENTIFICADOR': return `Identificador: ${a.nome}` + (a.papel === 'alvo' ? ' (recebe o valor)' : '');
      case 'NUMERO': return `Número: ${a.valor}`;
      case 'TEXTO': return `Texto: ${a.valor}`;
      case 'AGRUPAMENTO': return 'Agrupamento ( )';
      default: return `${no.rotulo} (${a.operador})`;
    }
  }

  function categoriaNo(tipo) {
    if (['ADICAO', 'SUBTRACAO', 'MULTIPLICACAO', 'DIVISAO'].includes(tipo)) return 'operacao';
    if (tipo === 'NUMERO' || tipo === 'TEXTO') return 'literal';
    return tipo.toLowerCase();
  }

  function criarItem(no, nivel) {
    const temFilhos = no.filhos.length > 0;
    const li = el('li', {
      role: 'treeitem', 'aria-level': nivel, 'aria-selected': 'false', tabindex: '-1',
      'aria-expanded': temFilhos ? 'false' : null, class: `no no-${categoriaNo(no.tipo)}`,
      dataset: { id: no.id, tipo: no.tipo },
    });
    const linha = el('div', { class: 'linha-no' },
      el('span', { class: 'alternar', 'aria-hidden': 'true', text: temFilhos ? '▸' : '·' }),
      el('span', { class: 'forma', 'aria-hidden': 'true', text: FORMAS[no.tipo] || '•' }),
      el('span', { class: 'rotulo-no', text: rotuloNo(no) }),
      el('span', { class: 'pos', text: ` L${no.linha}:${no.coluna}` + (no.linha === no.linha_fim ? `–${no.coluna_fim}` : `–L${no.linha_fim}:${no.coluna_fim}`) }));
    li.append(linha);
    return li;
  }

  function itemDe(id) { return $('arvore').querySelector(`li[data-id="${id}"]`); }

  function expandir(li, abrir) {
    if (!li || !li.hasAttribute('aria-expanded')) return;
    const info = estado.indice.get(li.dataset.id);
    let grupo = li.querySelector(':scope > ul');
    if (abrir && !grupo) {
      grupo = el('ul', { role: 'group' });
      info.no.filhos.forEach((f) => grupo.append(criarItem(f, info.nivel + 1)));
      li.append(grupo);
    }
    if (grupo) grupo.hidden = !abrir;
    li.setAttribute('aria-expanded', String(abrir));
    li.querySelector(':scope > .linha-no > .alternar').textContent = abrir ? '▾' : '▸';
  }

  function expandirAte(nivelMax, limite) {
    const fila = [...$('arvore').querySelectorAll(':scope > ul > li')];
    let abertos = 0;
    while (fila.length) {
      const li = fila.shift();
      const info = estado.indice.get(li.dataset.id);
      if (!info.no.filhos.length || info.nivel >= nivelMax) continue;
      if (abertos + info.no.filhos.length > limite) return false;
      expandir(li, true);
      abertos += info.no.filhos.length;
      fila.push(...li.querySelectorAll(':scope > ul > li'));
    }
    return true;
  }

  function revelar(id) {
    const caminho = [];
    for (let atual = id; atual; atual = estado.indice.get(atual).pai) caminho.unshift(atual);
    caminho.slice(0, -1).forEach((a) => expandir(itemDe(a), true));
    return itemDe(id);
  }

  function focarItem(li) {
    if (!li) return;
    $('arvore').querySelectorAll('li[tabindex="0"]').forEach((x) => x.setAttribute('tabindex', '-1'));
    li.setAttribute('tabindex', '0');
    li.focus();
  }

  function selecionarNo(id, { focar = true } = {}) {
    const info = estado.indice.get(id);
    if (!info) return;
    const li = revelar(id);
    $('arvore').querySelectorAll('li[aria-selected="true"]').forEach((x) => x.setAttribute('aria-selected', 'false'));
    if (li) { li.setAttribute('aria-selected', 'true'); if (focar) focarItem(li); else li.setAttribute('tabindex', '0'); }
    estado.selecionado = id;
    const no = info.no;
    const ini = [no.linha, no.coluna];
    const fim = [no.linha_fim, no.coluna_fim];
    destacar(ini, fim);
    const atributos = el('ul', { class: 'atributos' });
    Object.entries(no.atributos || {}).forEach(([k, v]) => atributos.append(el('li', null, el('code', { text: k }), `: ${v}`)));
    mostrarDetalhes(`Nó selecionado: ${no.rotulo}`, [
      ['Tipo', el('code', { text: no.tipo })],
      ['Regra gramatical', el('code', { text: no.regra })],
      ['Posição', descreverPosicao(no.linha, no.coluna, no.linha_fim, no.coluna_fim)],
      ['Trecho', el('code', { class: 'trecho', text: trecho(ini, fim) })],
      ['Atributos', atributos.children.length ? atributos : 'nenhum'],
      ['Filhos', String(no.filhos.length)],
    ]);
  }

  function raizesDaArvore(sin) {
    if (sin.ast) return [sin.ast];
    return sin.arvore_parcial || [];
  }

  function renderizarArvore(d) {
    const cont = $('arvore');
    const info = $('info-arvore');
    cont.replaceChildren();
    cont.classList.remove('com-filtro');
    info.textContent = '';
    const sin = d.sintatico;
    construirIndice(raizesDaArvore(sin));
    const filtro = $('filtro-tipo');
    filtro.replaceChildren(el('option', { value: '', text: 'Todos os nós' }));
    const temArvore = Boolean(sin.ast);
    ['btn-expandir', 'btn-recolher', 'btn-exportar', 'filtro-tipo'].forEach((id) => { $(id).disabled = !temArvore; });
    if (!temArvore) {
      let msg;
      if (!sin.executado) msg = 'Não há árvore: a análise sintática não foi executada por causa dos erros léxicos.';
      else if (sin.erros.length) msg = 'Não há árvore: o programa tem um erro sintático. A aba "Passo a passo" mostra o que o parser já havia reconhecido antes do erro.';
      else msg = (sin.avisos && sin.avisos[0]) || 'A árvore não está disponível.';
      cont.append(el('p', { class: 'vazio', text: msg }));
      return;
    }
    const contagem = new Map();
    const rotulos = new Map();
    estado.indice.forEach(({ no }) => { contagem.set(no.tipo, (contagem.get(no.tipo) || 0) + 1); rotulos.set(no.tipo, no.rotulo); });
    [...contagem.entries()].sort().forEach(([tipo, n]) => {
      filtro.append(el('option', { value: tipo, text: `${rotulos.get(tipo)} (${n})` }));
    });
    const ul = el('ul', { role: 'none' });
    const raiz = criarItem(sin.ast, 1);
    raiz.setAttribute('tabindex', '0');
    ul.append(raiz);
    cont.append(ul);
    expandir(raiz, true);
    if (estado.indice.size <= EXPANDIR_TUDO_ATE) expandirAte(Infinity, LIMITE_NOS_EXPANDIR);
    else expandirAte(3, LIMITE_NOS_EXPANDIR);
    info.textContent = `${plural(estado.indice.size, 'nó', 'nós')}. Use as setas do teclado para navegar, Enter para selecionar.`;
  }

  function itensVisiveis() {
    return [...$('arvore').querySelectorAll('li[role="treeitem"]')].filter((li) => !li.closest('ul[hidden]'));
  }

  function teclaArvore(ev) {
    const li = ev.target.closest('li[role="treeitem"]');
    if (!li) return;
    const vis = itensVisiveis();
    const i = vis.indexOf(li);
    const expandido = li.getAttribute('aria-expanded') === 'true';
    switch (ev.key) {
      case 'ArrowDown': focarItem(vis[i + 1]); break;
      case 'ArrowUp': focarItem(vis[i - 1]); break;
      case 'Home': focarItem(vis[0]); break;
      case 'End': focarItem(vis[vis.length - 1]); break;
      case 'ArrowRight':
        if (li.hasAttribute('aria-expanded') && !expandido) expandir(li, true);
        else if (expandido) focarItem(li.querySelector(':scope > ul > li'));
        break;
      case 'ArrowLeft':
        if (expandido) expandir(li, false);
        else focarItem(li.parentElement.closest('li[role="treeitem"]'));
        break;
      case 'Enter': case ' ': selecionarNo(li.dataset.id); break;
      default: return;
    }
    ev.preventDefault();
  }

  function cliqueArvore(ev) {
    const li = ev.target.closest('li[role="treeitem"]');
    if (!li) return;
    if (ev.target.classList.contains('alternar')) {
      expandir(li, li.getAttribute('aria-expanded') !== 'true');
      focarItem(li);
      return;
    }
    selecionarNo(li.dataset.id);
  }

  function aplicarFiltro() {
    const tipo = $('filtro-tipo').value;
    const cont = $('arvore');
    const info = $('info-arvore');
    cont.querySelectorAll('.filtrado').forEach((x) => x.classList.remove('filtrado'));
    cont.classList.toggle('com-filtro', Boolean(tipo));
    if (!tipo) { info.textContent = ''; return; }
    let n = 0;
    let revelados = 0;
    estado.indice.forEach(({ no }) => {
      if (no.tipo !== tipo) return;
      n++;
      if (revelados >= LIMITE_NOS_EXPANDIR) return;
      const li = revelar(no.id);
      if (li) { li.classList.add('filtrado'); revelados++; }
    });
    info.textContent = `${plural(n, 'nó destacado', 'nós destacados')} do tipo ${tipo}` +
      (revelados < n ? ` (mostrando ${revelados}).` : '.');
  }

  function exportarAst() {
    const info = $('info-arvore');
    const ast = estado.dados && estado.dados.sintatico.ast;
    if (!ast) return;
    const json = JSON.stringify(ast, null, 2);
    const URL_ = window.URL;
    if (!URL_ || typeof URL_.createObjectURL !== 'function' || typeof window.Blob !== 'function') {
      info.textContent = 'A exportação não está disponível neste navegador.';
      return;
    }
    const url = URL_.createObjectURL(new window.Blob([json], { type: 'application/json' }));
    const a = el('a', { href: url, download: 'ast.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL_.revokeObjectURL(url), 1000);
    info.textContent = 'AST exportada como ast.json.';
  }

  // ------------------------------------------------------------------ tokens
  function renderizarTokens(d) {
    const tokens = d.lexico.tokens;
    const contagem = $('contagem-categorias');
    contagem.replaceChildren();
    const porTipo = new Map();
    tokens.forEach((t) => porTipo.set(t.tipo, (porTipo.get(t.tipo) || 0) + 1));
    contagem.append(el('span', { class: 'ajuda', text: `${plural(tokens.length, 'token', 'tokens')}: ` }));
    Object.keys(CATEGORIAS).forEach((tipo) => {
      if (porTipo.has(tipo)) contagem.append(el('span', { class: `chip cat-${tipo}`, text: `${CATEGORIAS[tipo]}: ${porTipo.get(tipo)}` }), ' ');
    });
    if (d.lexico.erros.length) contagem.append(el('span', { class: 'chip erro-lexico', text: `Erros léxicos: ${d.lexico.erros.length}` }));
    const corpo = $('tabela-tokens').querySelector('tbody');
    corpo.replaceChildren();
    const aviso = $('aviso-tokens');
    aviso.hidden = tokens.length <= LIMITE_TOKENS_TABELA;
    aviso.textContent = aviso.hidden ? '' : `Mostrando os primeiros ${LIMITE_TOKENS_TABELA} de ${tokens.length} tokens.`;
    const erroIdx = d.sintatico.erros[0] ? d.sintatico.erros[0].token : null;
    const frag = document.createDocumentFragment();
    tokens.slice(0, LIMITE_TOKENS_TABELA).forEach((t, i) => {
      frag.append(el('tr', { dataset: { i }, tabindex: '0', class: i === erroIdx ? 'erro-sintatico' : null },
        el('td', { text: String(i) }),
        el('td', null, el('span', { class: `tok cat-${t.tipo}`, text: t.tipo })),
        el('td', null, el('code', { text: lexemaVisivel(t) })),
        el('td', { text: String(t.linha) }),
        el('td', { text: String(t.coluna) })));
    });
    corpo.append(frag);
    if (!tokens.length) corpo.append(el('tr', null, el('td', { colspan: '5', class: 'vazio', text: 'Nenhum token (o código só tem comentários, espaços ou erros léxicos).' })));
  }

  function selecionarToken(i) {
    const t = estado.dados.lexico.tokens[i];
    if (!t) return;
    destacar([t.linha, t.coluna], fimToken(t));
    // relação token ↔ árvore: a folha que começa na mesma posição
    let folha = null;
    estado.indice.forEach(({ no }) => {
      if (!folha && no.filhos.length === 0 && no.linha === t.linha && no.coluna === t.coluna) folha = no;
    });
    if (folha) { const li = revelar(folha.id); if (li) li.classList.add('relacionado'); }
    mostrarDetalhes(`Token #${i}`, [
      ['Categoria', el('code', { text: t.tipo })],
      ['Lexema', el('code', { text: lexemaVisivel(t) })],
      ['Posição', descreverPosicao(t.linha, t.coluna, ...fimToken(t))],
      ['Na árvore', folha ? `${folha.rotulo} (${folha.id})` : 'sem nó próprio: símbolos como =, ( ) e o fim de linha não viram nós da AST'],
    ]);
  }

  // ------------------------------------------------------------------ passo a passo
  function renderizarPassos(d) {
    pararReproducao();
    const sin = d.sintatico;
    const passos = sin.passos || [];
    estado.criadoNoPasso = new Map();
    passos.forEach((p, i) => { if (p.no_criado) estado.criadoNoPasso.set(p.no_criado, i); });
    const aviso = $('aviso-passos');
    const corpo = $('tabela-passos').querySelector('tbody');
    corpo.replaceChildren();
    const faixa = $('passo-faixa');
    const controles = ['passo-inicio', 'passo-anterior', 'passo-reproduzir', 'passo-proximo', 'passo-fim', 'passo-faixa'];
    controles.forEach((id) => { $(id).disabled = passos.length === 0; });
    if (!passos.length) {
      aviso.hidden = false;
      aviso.textContent = sin.executado ? 'Não há passos registrados.' : 'O parser não foi executado (há erros léxicos), então não há passo a passo.';
      $('passo-atual').replaceChildren();
      $('arvore-parcial').replaceChildren();
      $('passo-rotulo').textContent = '';
      faixa.max = '0';
      return;
    }
    aviso.hidden = !sin.passos_truncados;
    aviso.textContent = sin.passos_truncados
      ? `Programa grande: mostrando os primeiros ${passos.length} de ${sin.total_passos} passos. A análise completa foi feita normalmente.`
      : '';
    const frag = document.createDocumentFragment();
    passos.forEach((p, i) => {
      frag.append(el('tr', { dataset: { k: i }, class: `passo-${p.tipo}`, tabindex: '0' },
        el('td', { text: String(p.numero) }),
        el('td', null, el('code', { text: p.pilha.join(' ') })),
        el('td', null, el('code', { text: p.entrada.join(' ') })),
        el('td', { text: p.acao })));
    });
    corpo.append(frag);
    faixa.max = String(passos.length - 1);
    irParaPasso(0, { rolarTabela: false });
  }

  function simboloPilha(s) {
    let classe = 'simb';
    if (s.startsWith('{')) classe += ' simb-acao';
    else if (/^[A-Z_']+$/.test(s) && s !== 'NOVA_LINHA') classe += ' simb-nt';
    else classe += ' simb-t';
    return el('span', { class: classe, text: s });
  }

  function irParaPasso(k, { rolarTabela = true } = {}) {
    const passos = estado.dados.sintatico.passos || [];
    if (!passos.length) return;
    k = Math.max(0, Math.min(k, passos.length - 1));
    estado.passo = k;
    const p = passos[k];
    $('passo-faixa').value = String(k);
    $('passo-rotulo').textContent = `Passo ${k + 1} de ${passos.length}` + (estado.dados.sintatico.passos_truncados ? ` (total: ${estado.dados.sintatico.total_passos})` : '');
    const pilha = el('div', { class: 'pilha', 'aria-label': 'Pilha, do fundo ao topo' }, ...p.pilha.map(simboloPilha));
    const entrada = el('div', { class: 'entrada' }, ...p.entrada.map((x) => el('span', { class: 'simb simb-t', text: x })));
    const caixa = el('dl', { class: 'dl-passo' },
      el('dt', { text: 'Pilha (topo à direita)' }), el('dd', null, pilha),
      el('dt', { text: 'Entrada restante' }), el('dd', null, entrada),
      el('dt', { text: 'Ação' }), el('dd', { class: `acao-${p.tipo}`, text: p.acao }));
    if (p.celula) caixa.append(el('dt', { text: 'Tabela M' }), el('dd', { text: `M[${p.celula.nao_terminal}, ${p.celula.terminal}] = produção ${p.producao}` }));
    $('passo-atual').replaceChildren(caixa);
    $('tabela-passos').querySelectorAll('tr.atual').forEach((tr) => tr.classList.remove('atual'));
    const linha = $('tabela-passos').querySelector(`tr[data-k="${k}"]`);
    if (linha) { linha.classList.add('atual'); if (rolarTabela) rolar(linha); }
    if (p.token !== null && p.token !== undefined) {
      const t = estado.dados.lexico.tokens[p.token];
      if (t) destacar([t.linha, t.coluna], fimToken(t));
    } else if (p.tipo === 'erro' && estado.dados.sintatico.erros[0]) {
      const e = estado.dados.sintatico.erros[0];
      destacar([e.linha, e.coluna], [e.linha_fim, e.coluna_fim]);
    }
    renderizarArvoreParcial(k);
    destacarCelulas();
  }

  function renderizarArvoreParcial(k) {
    const cont = $('arvore-parcial');
    cont.replaceChildren();
    const visivel = (id) => estado.criadoNoPasso.has(id) && estado.criadoNoPasso.get(id) <= k;
    const raizes = [];
    estado.indice.forEach(({ no, pai }) => { if (visivel(no.id) && !(pai && visivel(pai))) raizes.push(no); });
    raizes.sort((a, b) => a.linha - b.linha || a.coluna - b.coluna);
    if (!raizes.length) {
      cont.append(el('p', { class: 'vazio', text: 'Nenhum nó criado ainda.' }));
      return;
    }
    let restantes = LIMITE_NOS_PARCIAL;
    const montar = (no) => {
      restantes--;
      const li = el('li', { class: `no-${categoriaNo(no.tipo)}` },
        el('span', { class: 'forma', 'aria-hidden': 'true', text: FORMAS[no.tipo] || '•' }), ' ', rotuloNo(no));
      if (estado.criadoNoPasso.get(no.id) === k) li.classList.add('novo');
      const filhos = no.filhos.filter((f) => visivel(f.id));
      if (filhos.length && restantes > 0) {
        const ul = el('ul');
        filhos.forEach((f) => { if (restantes > 0) ul.append(montar(f)); });
        li.append(ul);
      }
      return li;
    };
    const ul = el('ul', { class: 'arvore-texto' });
    raizes.forEach((r) => { if (restantes > 0) ul.append(montar(r)); });
    cont.append(ul);
    if (restantes <= 0) cont.append(el('p', { class: 'ajuda', text: `Mostrando os primeiros ${LIMITE_NOS_PARCIAL} nós.` }));
  }

  function pararReproducao() {
    if (estado.temporizador) clearInterval(estado.temporizador);
    estado.temporizador = null;
    const b = $('passo-reproduzir');
    if (b) b.textContent = '▶ Reproduzir';
  }

  function alternarReproducao() {
    if (estado.temporizador) { pararReproducao(); return; }
    const passos = estado.dados.sintatico.passos || [];
    if (estado.passo >= passos.length - 1) irParaPasso(0);
    $('passo-reproduzir').textContent = '⏸ Pausar';
    const intervalo = (window.APP_CONFIG || {}).intervaloReproducaoMs || INTERVALO_REPRODUCAO_MS;
    estado.temporizador = setInterval(() => {
      if (estado.passo >= passos.length - 1) { pararReproducao(); return; }
      irParaPasso(estado.passo + 1);
    }, intervalo);
  }

  // ------------------------------------------------------------------ gramática e tabela M
  async function carregarGramatica() {
    if (estado.gramatica) { renderizarGramatica(); return; }
    if (estado.carregandoGramatica) return;
    const cont = $('conteudo-gramatica');
    cont.replaceChildren(el('p', { class: 'vazio', text: 'Carregando a gramática…' }));
    estado.carregandoGramatica = window.ApiCompiladores.obterGramatica();
    const r = await estado.carregandoGramatica;
    estado.carregandoGramatica = null;
    if (r.tipo !== 'sucesso') {
      cont.replaceChildren(el('p', { class: 'bloco bloco-erro', text: 'Não foi possível carregar a gramática. Verifique a conexão e abra a aba novamente.' }));
      return;
    }
    estado.gramatica = r.dados;
    renderizarGramatica();
  }

  function renderizarGramatica() {
    const g = estado.gramatica;
    const cont = $('conteudo-gramatica');
    const prods = el('ol', { class: 'producoes' }, ...g.producoes.map((p) => el('li', { value: p.numero }, el('code', { text: p.texto }))));
    const terms = el('table', { class: 'tabela' },
      el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Terminal' }), el('th', { scope: 'col', text: 'Nas mensagens' }), el('th', { scope: 'col', text: 'Token do scanner' }))),
      el('tbody', null, ...g.terminais.map((t) => el('tr', null, el('td', null, el('code', { text: t.simbolo })), el('td', { text: t.descricao }), el('td', { text: t.token })))));
    const ff = el('table', { class: 'tabela' },
      el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Não-terminal' }), el('th', { scope: 'col', text: 'FIRST' }), el('th', { scope: 'col', text: 'FOLLOW' }))),
      el('tbody', null, ...g.nao_terminais.map((a) => el('tr', null, el('th', { scope: 'row' }, el('code', { text: a })),
        el('td', null, el('code', { text: `{ ${g.first[a].join(', ')} }` })),
        el('td', null, el('code', { text: `{ ${g.follow[a].join(', ')} }` }))))));
    const terminais = g.terminais.map((t) => t.simbolo);
    const textoProd = new Map(g.producoes.map((p) => [p.numero, p.texto]));
    const m = el('table', { class: 'tabela tabela-m', id: 'tabela-m' },
      el('caption', { class: 'sr-only', text: 'Tabela de análise preditiva M' }),
      el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'M' }), ...terminais.map((t) => el('th', { scope: 'col' }, el('code', { text: t }))))),
      el('tbody', null, ...g.nao_terminais.map((a) => el('tr', null, el('th', { scope: 'row' }, el('code', { text: a })),
        ...terminais.map((t) => {
          const n = g.tabela[a][t];
          return el('td', {
            dataset: { nt: a, t }, class: n ? 'preenchida' : 'vazia',
            title: n ? `M[${a}, ${t}] = ${textoProd.get(n)}` : `M[${a}, ${t}]: vazia (erro)`,
            text: n ? String(n) : '',
          });
        })))));
    cont.replaceChildren(
      el('h3', { text: 'Produções (símbolo inicial: ' + g.simbolo_inicial + ')' }), prods,
      el('h3', { text: 'Terminais e tokens' }), el('div', { class: 'tabela-rolavel' }, terms),
      el('h3', { text: 'Conjuntos FIRST e FOLLOW' }), el('div', { class: 'tabela-rolavel' }, ff),
      el('h3', { text: 'Tabela M' }),
      el('p', { class: 'ajuda', text: 'Cada célula preenchida indica o número da produção aplicada quando o não-terminal da linha está no topo da pilha e o terminal da coluna é o próximo token. Passe o mouse para ver a produção.' }),
      el('div', { class: 'tabela-rolavel' }, m),
      el('p', { id: 'legenda-tabela-m', class: 'ajuda', 'aria-live': 'polite' }));
    destacarCelulas();
  }

  function celulaM(m, nt, t) {
    return [...m.querySelectorAll('td[data-nt]')].find((c) => c.dataset.nt === nt && c.dataset.t === t) || null;
  }

  function destacarCelulas() {
    const m = $('tabela-m');
    if (!m || !estado.dados) return;
    m.querySelectorAll('.celula-atual, .celula-erro').forEach((c) => {
      c.classList.remove('celula-atual', 'celula-erro');
      if (c.classList.contains('vazia')) c.textContent = '';
    });
    const legenda = [];
    const passo = (estado.dados.sintatico.passos || [])[estado.passo];
    if (passo && passo.celula) {
      const c = celulaM(m, passo.celula.nao_terminal, passo.celula.terminal);
      if (c) { c.classList.add('celula-atual'); legenda.push(`Contorno: célula usada no passo ${passo.numero}, M[${passo.celula.nao_terminal}, ${passo.celula.terminal}].`); }
    }
    const e = estado.dados.sintatico.erros[0];
    if (e && e.celula_tabela) {
      const c = celulaM(m, e.celula_tabela.nao_terminal, e.celula_tabela.terminal);
      if (c) { c.classList.add('celula-erro'); c.textContent = '✗'; }
      legenda.push(`✗: a análise falhou na célula vazia M[${e.celula_tabela.nao_terminal}, ${e.celula_tabela.terminal}]` +
        (c ? '.' : ' (o token encontrado não é um terminal da gramática, por isso não tem coluna na tabela).'));
    }
    const leg = $('legenda-tabela-m');
    if (leg) leg.textContent = legenda.join(' ');
  }

  // ------------------------------------------------------------------ abas
  const ABAS = ['aba-arvore', 'aba-tokens', 'aba-passos', 'aba-gramatica'];
  function ativarAba(id, { focar = false } = {}) {
    ABAS.forEach((a) => {
      const botao = $(a);
      const ativo = a === id;
      botao.setAttribute('aria-selected', String(ativo));
      botao.setAttribute('tabindex', ativo ? '0' : '-1');
      $(botao.getAttribute('aria-controls')).hidden = !ativo;
      if (ativo && focar) botao.focus();
    });
    if (id !== 'aba-passos') pararReproducao();
    if (id === 'aba-gramatica') carregarGramatica();
  }

  function configurarEventos() {
    ABAS.forEach((id, i) => {
      $(id).addEventListener('click', () => ativarAba(id));
      $(id).addEventListener('keydown', (ev) => {
        const desloc = { ArrowRight: 1, ArrowLeft: -1 }[ev.key];
        if (desloc) { ev.preventDefault(); ativarAba(ABAS[(i + desloc + ABAS.length) % ABAS.length], { focar: true }); }
      });
    });
    $('arvore').addEventListener('click', cliqueArvore);
    $('arvore').addEventListener('keydown', teclaArvore);
    $('btn-expandir').addEventListener('click', () => {
      const completo = expandirAte(Infinity, LIMITE_NOS_EXPANDIR);
      $('info-arvore').textContent = completo ? 'Árvore totalmente expandida.' : `Árvore grande: foram abertos até ${LIMITE_NOS_EXPANDIR} nós.`;
    });
    $('btn-recolher').addEventListener('click', () => {
      $('arvore').querySelectorAll('li[aria-expanded="true"]').forEach((li) => expandir(li, false));
      expandir($('arvore').querySelector('li[aria-level="1"]'), true);
      $('info-arvore').textContent = 'Árvore recolhida.';
    });
    $('filtro-tipo').addEventListener('change', aplicarFiltro);
    $('btn-exportar').addEventListener('click', exportarAst);
    $('codigo-analisado').addEventListener('click', (ev) => {
      const s = ev.target.closest('.tok[data-i]');
      if (s) selecionarToken(Number(s.dataset.i));
    });
    const tabelaTokens = $('tabela-tokens');
    tabelaTokens.addEventListener('click', (ev) => { const tr = ev.target.closest('tr[data-i]'); if (tr) selecionarToken(Number(tr.dataset.i)); });
    tabelaTokens.addEventListener('keydown', (ev) => { const tr = ev.target.closest('tr[data-i]'); if (tr && ev.key === 'Enter') selecionarToken(Number(tr.dataset.i)); });
    const tabelaPassos = $('tabela-passos');
    tabelaPassos.addEventListener('click', (ev) => { const tr = ev.target.closest('tr[data-k]'); if (tr) { pararReproducao(); irParaPasso(Number(tr.dataset.k), { rolarTabela: false }); } });
    tabelaPassos.addEventListener('keydown', (ev) => { const tr = ev.target.closest('tr[data-k]'); if (tr && ev.key === 'Enter') irParaPasso(Number(tr.dataset.k), { rolarTabela: false }); });
    const ultimo = () => (estado.dados.sintatico.passos || []).length - 1;
    $('passo-inicio').addEventListener('click', () => { pararReproducao(); irParaPasso(0); });
    $('passo-anterior').addEventListener('click', () => { pararReproducao(); irParaPasso(estado.passo - 1); });
    $('passo-proximo').addEventListener('click', () => { pararReproducao(); irParaPasso(estado.passo + 1); });
    $('passo-fim').addEventListener('click', () => { pararReproducao(); irParaPasso(ultimo()); });
    $('passo-reproduzir').addEventListener('click', alternarReproducao);
    $('passo-faixa').addEventListener('input', (ev) => { pararReproducao(); irParaPasso(Number(ev.target.value)); });
  }

  // ------------------------------------------------------------------ API pública
  function mostrar(d) {
    estado.dados = d;
    estado.selecionado = null;
    estado.passo = 0;
    const secao = $('secao-analise');
    const resultado = !d.lexico.sucesso ? 'erro-lexico' : (d.sintatico.sucesso ? 'valido' : 'erro-sintatico');
    secao.dataset.resultado = resultado;
    $('erros-analise').dataset.resultado = resultado;
    secao.hidden = false;
    $('detalhes-selecao').replaceChildren(el('p', { class: 'ajuda', text: 'Nada selecionado.' }));
    renderizarErros(d);
    renderizarCodigo(d);
    renderizarLegenda(d);
    renderizarArvore(d);
    renderizarTokens(d);
    renderizarPassos(d);
    if (estado.gramatica) renderizarGramatica();
    const abaAtual = ABAS.find((a) => $(a).getAttribute('aria-selected') === 'true');
    if (abaAtual === 'aba-gramatica') carregarGramatica();
  }

  function limpar() {
    pararReproducao();
    estado.dados = null;
    estado.indice = new Map();
    $('secao-analise').hidden = true;
    $('secao-analise').dataset.resultado = 'nenhum';
    $('erros-analise').replaceChildren();
    delete $('erros-analise').dataset.resultado;
    ['codigo-analisado', 'arvore', 'detalhes-selecao', 'passo-atual', 'arvore-parcial', 'contagem-categorias', 'legenda-categorias']
      .forEach((id) => $(id).replaceChildren());
    $('tabela-tokens').querySelector('tbody').replaceChildren();
    $('tabela-passos').querySelector('tbody').replaceChildren();
  }

  configurarEventos();
  window.Analise = {
    mostrar, limpar, selecionarNo, selecionarToken, irParaPasso, ativarAba,
    estado: () => ({ passo: estado.passo, selecionado: estado.selecionado, nos: estado.indice.size }),
  };
})();
