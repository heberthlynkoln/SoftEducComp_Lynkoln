// Lógica da interface.
// Etapa 3: o código informado é guardado, pode ser editado/substituído e é enviado
// ao backend como texto puro. Nenhuma validação sintática é feita aqui: o código
// pode conter erros intencionais.
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
  function mostrarResultado(estado, titulo, linhas, textoCodigo) {
    resultados.dataset.estado = estado;
    resultados.replaceChildren();
    if (estado === 'inicial') {
      const p = document.createElement('p');
      p.className = 'vazio';
      p.textContent = 'Os resultados da análise aparecerão aqui: mensagens de validação, erros sintáticos ' +
        '(com posição e tokens esperados) e, nas próximas etapas, a árvore sintática.';
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
    if (textoCodigo !== undefined) {
      const rotulo = document.createElement('p');
      rotulo.className = 'ajuda';
      rotulo.textContent = 'Código recebido pelo backend:';
      const pre = document.createElement('pre');
      pre.className = 'eco-codigo';
      pre.id = 'eco-codigo';
      pre.textContent = textoCodigo;   // textContent: nunca interpreta HTML
      resultados.append(rotulo, pre);
    }
  }

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
      mostrarResultado(
        integro ? 'info' : 'erro',
        integro ? d.mensagem : 'Código recebido com divergência',
        [
          `${rotuloLinhas(d.estatisticas.linhas)}, ${d.estatisticas.caracteres} caracteres (${d.estatisticas.bytes} bytes).`,
          integro
            ? 'O backend recebeu o texto exatamente como foi informado. A análise léxica e sintática será adicionada nas próximas etapas.'
            : 'O texto devolvido pelo backend difere do enviado.',
        ],
        d.codigo);
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
