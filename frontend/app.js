// Lógica da interface.
// Etapa 3 do roteiro (análise léxica): o código é enviado ao backend, que devolve
// tokens e erros léxicos. A interface mostra o código com os tokens destacados, a
// tabela de tokens, a contagem por categoria e os erros. Nenhuma análise é feita aqui.
(function () {
  const LIMITE_CARACTERES = 100000;           // igual ao do backend
  const CHAVE_STORAGE = 'compiladores.codigo'; // onde o código é preservado entre recargas
  const CODIGO_INICIAL = 'x = 5\ntotal = preco * (qtd + 1)\n';

  const $ = (id) => document.getElementById(id);
  const codigo = $('codigo');
  const seletor = $('seletor-exemplos');
  const descricao = $('descricao-exemplo');
  const resultados = $('resultados');
  const contador = $('contador');
  const statusBackend = $('status-backend');
  const btnAnalisar = $('btn-analisar');

  // ---- Armazenamento local (pode estar indisponível: sempre dentro de try/catch) ----
  function lerSalvo() {
    try { return window.localStorage.getItem(CHAVE_STORAGE); } catch (e) { return null; }
  }
  function salvar(texto) {
    try { window.localStorage.setItem(CHAVE_STORAGE, texto); } catch (e) { /* ignora */ }
  }

  // ---- Contagem de linhas (mesma regra do backend: \n, \r\n e \r; terminador final não conta) ----
  function contarLinhas(texto) {
    if (texto === '') return 0;
    return texto.replace(/(\r\n|\r|\n)$/, '').split(/\r\n|\r|\n/).length;
  }
  const rotuloLinhas = (n) => `${n} ${n === 1 ? 'linha' : 'linhas'}`;

  // ---- Código atual: única fonte de verdade é o conteúdo do campo, exatamente como está ----
  function obterCodigo() { return codigo.value; }

  function definirCodigo(texto) {
    codigo.value = texto;
    atualizarContador();
    salvar(texto);
  }

  // Caracteres = pontos de código Unicode (um emoji conta 1), igual ao backend.
  const contarCaracteres = (texto) => Array.from(texto).length;

  function atualizarContador() {
    const texto = obterCodigo();
    contador.textContent = `${rotuloLinhas(contarLinhas(texto))} · ${contarCaracteres(texto)} caracteres`;
  }

  codigo.maxLength = LIMITE_CARACTERES;
  codigo.addEventListener('input', () => { atualizarContador(); salvar(obterCodigo()); });

  // ---- Exemplos ----
  const construcoes = $('construcoes-exemplo');
  let exemploAtual = null; // exemplo carregado e ainda não modificado pelo usuário

  function criarGrupo(rotulo, lista) {
    const grupo = document.createElement('optgroup');
    grupo.label = rotulo;
    lista.forEach((ex) => {
      const opt = document.createElement('option');
      opt.value = ex.id;
      opt.textContent = ex.titulo;
      grupo.appendChild(opt);
    });
    seletor.appendChild(grupo);
  }
  criarGrupo('Programas válidos', EXEMPLOS.filter((e) => e.valido));
  criarGrupo('Programas com erro intencional', EXEMPLOS.filter((e) => !e.valido));

  function mostrarInfoExemplo(descricaoTexto, demonstraTexto) {
    descricao.textContent = descricaoTexto;
    construcoes.textContent = demonstraTexto ? `Demonstra: ${demonstraTexto}` : '';
  }

  seletor.addEventListener('change', () => {
    const ex = EXEMPLOS.find((e) => e.id === seletor.value);
    if (!ex) { exemploAtual = null; mostrarInfoExemplo('', ''); return; }
    definirCodigo(ex.codigo);     // substitui todo o conteúdo atual, que continua editável
    exemploAtual = ex;
    mostrarInfoExemplo(ex.descricao, ex.demonstra);
    invalidarEnvioPendente();
    mostrarResultado('inicial');
  });

  // Ao editar um exemplo carregado, o seletor volta ao início: assim o mesmo exemplo
  // pode ser selecionado de novo para restaurar o original.
  codigo.addEventListener('input', () => {
    if (exemploAtual && obterCodigo() !== exemploAtual.codigo) {
      mostrarInfoExemplo(`Você editou o exemplo "${exemploAtual.titulo}". ` +
        'Selecione-o novamente para restaurar o original.', exemploAtual.demonstra);
      seletor.value = '';
      exemploAtual = null;
    }
  });

  // ---- Resultados ----
  function mostrarResultado(estado, titulo, linhas, extras = []) {
    resultados.dataset.estado = estado;
    resultados.replaceChildren();
    if (estado === 'inicial') {
      const p = document.createElement('p');
      p.className = 'vazio';
      p.textContent = 'Os resultados aparecerão aqui: os tokens identificados, com categoria, lexema e posição, ' +
        'e os erros léxicos, com a localização de cada um.';
      resultados.appendChild(p);
      resultados.removeAttribute('role');
      return;
    }
    resultados.setAttribute('role', estado === 'erro' ? 'alert' : 'status');
    const t = document.createElement('p');
    t.className = 'titulo-msg';
    t.textContent = titulo;
    resultados.appendChild(t);
    (linhas || []).forEach((txt) => {
      const p = document.createElement('p');
      p.textContent = txt;
      resultados.appendChild(p);
    });
    resultados.append(...extras);
  }

  // ---- Análise léxica: apresentação didática ----
  // Rótulo de cada categoria de token (mesmos nomes enviados pelo backend).
  const CATEGORIAS = {
    PALAVRA_RESERVADA: 'palavra reservada',
    IDENTIFICADOR: 'identificador',
    LITERAL_INTEIRO: 'número inteiro',
    LITERAL_REAL: 'número real',
    LITERAL_STRING: 'texto (string)',
    OPERADOR: 'operador',
    DELIMITADOR: 'delimitador',
    QUEBRA_DE_LINHA: 'quebra de linha',
  };
  const classeDoTipo = (tipo) => 'tok-' + tipo.toLowerCase().replace(/_/g, '-');
  // Mostra caracteres invisíveis como escapes (\n, \t), como aparecem em código.
  const escaparParaExibir = (s) => JSON.stringify(s).slice(1, -1);
  const paragrafo = (texto, classe) => {
    const p = document.createElement('p');
    if (classe) p.className = classe;
    p.textContent = texto;
    return p;
  };

  // Índice (em pontos de código) do início de cada linha: mesma regra do backend.
  function inicioDasLinhas(pontos) {
    const inicios = [0];
    for (let i = 0; i < pontos.length; i++) {
      if (pontos[i] === '\r' && pontos[i + 1] === '\n') { i++; inicios.push(i + 1); }
      else if (pontos[i] === '\r' || pontos[i] === '\n') inicios.push(i + 1);
    }
    return inicios;
  }

  // Monta o código com cada token em um <span> da sua categoria. O texto visível é
  // sempre idêntico ao original: trechos sem marca são mantidos como estão.
  function destacarCodigo(texto, tokens, erros) {
    const pontos = Array.from(texto);
    const inicios = inicioDasLinhas(pontos);
    const marcas = [];
    const marcar = (item, classe) => {
      const inicioDaLinha = inicios[item.linha - 1];
      if (inicioDaLinha === undefined) return;
      const inicio = inicioDaLinha + item.coluna - 1;
      marcas.push({ inicio, fim: inicio + Array.from(item.lexema).length, classe });
    };
    tokens.forEach((t) => { if (t.tipo !== 'QUEBRA_DE_LINHA') marcar(t, classeDoTipo(t.tipo)); });
    erros.forEach((e) => marcar(e, 'tok-erro'));
    marcas.sort((a, b) => a.inicio - b.inicio);

    const fragmento = document.createDocumentFragment();
    let cursor = 0;
    marcas.forEach((m) => {
      if (m.inicio < cursor || m.fim > pontos.length) return;   // nunca sobrepõe nem sai do texto
      if (m.inicio > cursor) fragmento.append(pontos.slice(cursor, m.inicio).join(''));
      const span = document.createElement('span');
      span.className = m.classe;
      span.textContent = pontos.slice(m.inicio, m.fim).join('');
      fragmento.append(span);
      cursor = m.fim;
    });
    if (cursor < pontos.length) fragmento.append(pontos.slice(cursor).join(''));
    return fragmento;
  }

  function montarEcoCodigo(texto, tokens, erros, integro) {
    const rotulo = paragrafo(integro
      ? 'Código recebido pelo backend, com os tokens destacados por categoria:'
      : 'Código recebido pelo backend:', 'ajuda');
    const pre = document.createElement('pre');
    pre.className = 'eco-codigo';
    pre.id = 'eco-codigo';
    // Só destaca quando o eco é fiel ao enviado; caso contrário, o texto aparece sem marcações.
    pre.append(integro ? destacarCodigo(texto, tokens, erros) : texto);
    return [rotulo, pre];
  }

  function montarLegenda() {
    const p = paragrafo('Cores: ', 'ajuda');
    Object.keys(CATEGORIAS).forEach((tipo, i) => {
      const span = document.createElement('span');
      span.className = classeDoTipo(tipo);
      span.textContent = CATEGORIAS[tipo];
      p.append(i ? ' · ' : '', span);
    });
    return p;
  }

  function montarContagem(tokens) {
    const total = {};
    tokens.forEach((t) => { total[t.tipo] = (total[t.tipo] || 0) + 1; });
    const partes = Object.keys(CATEGORIAS).filter((tipo) => total[tipo])
      .map((tipo) => `${CATEGORIAS[tipo]}: ${total[tipo]}`);
    return paragrafo(partes.length
      ? `Contagem por categoria: ${partes.join(' · ')}`
      : 'Nenhum token foi identificado.', 'ajuda');
  }

  function montarTabelaTokens(tokens) {
    const tabela = document.createElement('table');
    tabela.className = 'tabela-tokens';
    const cabeca = tabela.createTHead().insertRow();
    ['Tipo', 'Lexema', 'Linha', 'Coluna'].forEach((titulo) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = titulo;
      cabeca.append(th);
    });
    const corpo = tabela.createTBody();
    tokens.forEach((t) => {
      const linha = corpo.insertRow();
      const celulaTipo = linha.insertCell();
      celulaTipo.className = classeDoTipo(t.tipo);
      celulaTipo.textContent = t.tipo;
      linha.insertCell().textContent = escaparParaExibir(t.lexema);
      linha.insertCell().textContent = String(t.linha);
      linha.insertCell().textContent = String(t.coluna);
    });
    return tabela;
  }

  function montarErrosLexicos(erros) {
    const bloco = document.createElement('div');
    bloco.className = 'erros-lexicos';
    bloco.append(paragrafo(`Erros léxicos (${erros.length})`, 'titulo-secao'));
    const lista = document.createElement('ol');
    erros.forEach((e) => {
      const item = document.createElement('li');
      item.append(`Linha ${e.linha}, coluna ${e.coluna}: ${e.mensagem}. Trecho: `);
      const trecho = document.createElement('code');
      trecho.textContent = escaparParaExibir(e.lexema);
      item.append(trecho);
      lista.append(item);
    });
    bloco.append(lista, paragrafo('Verifique se o trecho faz parte do subconjunto suportado ' +
      '(veja "O que este analisador aceita?"). A análise continuou e os demais tokens foram listados.', 'ajuda'));
    return bloco;
  }

  const TEXTO_EXPLICATIVO = 'Como ler o resultado: o analisador percorre o código caractere a caractere e agrupa ' +
    'os caracteres em lexemas. Cada lexema vira um token, com uma categoria e uma posição (linha e coluna). ' +
    'Lexema é o trecho exato do código; token é a classificação desse trecho. Por exemplo, em "numero = 10", ' +
    'o lexema "numero" gera um token IDENTIFICADOR na coluna 1.';

  // ---- Envio ao backend ----
  let envioAtual = 0; // identifica o envio mais recente; respostas antigas são descartadas
  function invalidarEnvioPendente() {
    envioAtual++;
    btnAnalisar.disabled = false;
  }

  async function analisar() {
    const texto = obterCodigo();
    if (texto.trim() === '') {
      invalidarEnvioPendente();
      const vazio = texto === '';
      mostrarResultado('erro',
        vazio ? 'Informe um código-fonte antes de solicitar a análise.'
              : 'O código contém apenas espaços em branco.',
        ['Escreva um programa na área de código ou selecione um exemplo, e clique em Analisar.']);
      codigo.focus();
      return;
    }

    const meuEnvio = ++envioAtual;
    btnAnalisar.disabled = true;
    mostrarResultado('info', 'Enviando código ao backend…');

    try {
      // A comunicação (HTTP, formato do contrato, timeout) fica em api.js.
      const r = await ApiCompiladores.enviarCodigo(texto);
      if (meuEnvio !== envioAtual) return;     // o usuário já mudou de ideia: descarta a resposta
      btnAnalisar.disabled = false;
      exibirRetorno(r, texto);
    } catch (e) {
      // Falha não prevista: a mensagem é genérica (sem detalhes técnicos) e o editor é preservado.
      if (meuEnvio !== envioAtual) return;
      btnAnalisar.disabled = false;
      mostrarResultado('erro', 'Ocorreu um erro inesperado ao analisar o código.',
        ['Seu código continua no editor.', 'Tente novamente. Se o problema persistir, recarregue a página.']);
    }
  }

  // Exibe o resultado devolvido por ApiCompiladores.enviarCodigo.
  function exibirRetorno(r, texto) {
    if (r.tipo === 'sucesso') {
      const d = r.dados;
      const integro = d.codigo === texto;
      const comErros = d.erros.length > 0;
      let titulo = d.mensagem;
      let resumoLexico = `Análise léxica concluída: ${d.tokens.length} tokens identificados, nenhum erro.`;
      if (!integro) {
        titulo = 'Código recebido com divergência';
        resumoLexico = 'O texto devolvido pelo backend difere do enviado; a análise não é exibida.';
      } else if (comErros) {
        titulo = 'A análise léxica encontrou erros';
        resumoLexico = `Análise léxica concluída com ${d.erros.length} erro(s). Os demais tokens foram listados abaixo.`;
      }
      const extras = [paragrafo(TEXTO_EXPLICATIVO, 'ajuda')];
      if (integro && comErros) extras.push(montarErrosLexicos(d.erros));
      extras.push(...montarEcoCodigo(d.codigo, d.tokens, d.erros, integro));
      if (integro) {
        extras.push(montarLegenda(), montarContagem(d.tokens));
        extras.push(d.tokens.length
          ? montarTabelaTokens(d.tokens)
          : paragrafo('Nenhum token: o código não tem conteúdo além de espaços e comentários.', 'ajuda'));
      }
      mostrarResultado(
        integro && !comErros ? 'info' : 'erro',
        titulo,
        [`${rotuloLinhas(d.estatisticas.linhas)}, ${d.estatisticas.caracteres} caracteres (${d.estatisticas.bytes} bytes).`,
          resumoLexico],
        extras);
    } else if (r.tipo === 'rejeitado') {
      // O backend respondeu, mas recusou a entrada: mostramos a mensagem dele.
      const detalhes = (r.erro.detalhes || []).map((x) => x.problema).filter((p) => p !== r.erro.mensagem);
      mostrarResultado('erro', r.erro.mensagem,
        [...detalhes, `Código do erro: ${r.erro.codigo} (HTTP ${r.status}).`]);
    } else {
      // Mensagens para quem usa a ferramenta: sem comandos nem caminhos internos.
      const falhas = {
        rede: ['Falha de comunicação',
          ['Não foi possível comunicar com o servidor. Verifique a conexão e tente novamente.']],
        tempo: ['O servidor demorou demais para responder', ['Verifique a conexão e tente novamente.']],
        http: ['O servidor respondeu com um erro inesperado', [`Tente novamente em instantes. (HTTP ${r.status})`]],
        'resposta-invalida': ['Resposta inesperada do backend',
          ['O servidor respondeu, mas de forma que a aplicação não reconhece. Tente novamente.']],
      };
      const [titulo, dicas] = falhas[r.motivo] || falhas.rede;
      mostrarResultado('erro', titulo, [...dicas, 'Seu código continua no editor.']);
    }
  }

  btnAnalisar.addEventListener('click', analisar);
  $('btn-limpar').addEventListener('click', () => {
    invalidarEnvioPendente();
    seletor.value = '';
    exemploAtual = null;
    mostrarInfoExemplo('', '');
    definirCodigo('');
    mostrarResultado('inicial');
    codigo.focus();
  });
  codigo.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); analisar(); }
  });

  // ---- Status do backend ----
  function definirStatus(estado, texto) {
    statusBackend.dataset.estado = estado;
    statusBackend.textContent = texto;
  }
  fetch('/api/health')
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(() => definirStatus('ok', 'Backend conectado'))
    .catch(() => definirStatus('erro', 'Backend indisponível'));

  // ---- Início: restaura o que o usuário tinha ou usa o código inicial ----
  const salvo = lerSalvo();
  definirCodigo(salvo !== null ? salvo : CODIGO_INICIAL);
})();
