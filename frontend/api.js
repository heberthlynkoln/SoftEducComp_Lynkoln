// Comunicação com o backend (contrato em docs/API.md).
// Concentra o acesso HTTP para que app.js só se preocupe em exibir resultados.
//
// enviarCodigo(codigo) sempre RESOLVE (nunca lança) com um destes objetos:
//   { tipo: 'sucesso',   dados }                  HTTP 200 no formato do contrato
//   { tipo: 'rejeitado', status, erro }           erro no formato padrão (400, 413, 422...)
//   { tipo: 'falha',     motivo, status? }        motivo: 'rede' | 'tempo' | 'http' | 'resposta-invalida'
//
// obterGramatica() resolve com { tipo: 'sucesso', dados } ou { tipo: 'falha', motivo } (GET /api/gramatica).
(function () {
  const TEMPO_LIMITE_PADRAO_MS = 10000;
  const ROTA_ANALISAR = '/api/analisar';
  const ROTA_GRAMATICA = '/api/gramatica';

  const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  const lista = Array.isArray;
  const bool = (v) => typeof v === 'boolean';

  // Resultado da análise léxica: { sucesso, tokens: [...], erros: [...] }
  function lexicoValido(l) {
    return ehObjeto(l) && bool(l.sucesso) && lista(l.tokens) && lista(l.erros) &&
      l.tokens.every((t) => ehObjeto(t) && typeof t.tipo === 'string' && typeof t.lexema === 'string' &&
        Number.isInteger(t.linha) && Number.isInteger(t.coluna));
  }

  // Resultado da análise sintática: { executado, sucesso, ast|null, erros: [...], passos?: [...] }
  function sintaticoValido(s) {
    return ehObjeto(s) && bool(s.executado) && bool(s.sucesso) && lista(s.erros) &&
      (s.ast === null || ehObjeto(s.ast)) && (s.passos === undefined || lista(s.passos)) &&
      (!s.sucesso || s.executado);
  }

  function respostaSucessoValida(d) {
    return ehObjeto(d) && d.recebido === true && typeof d.mensagem === 'string' &&
      typeof d.codigo === 'string' && ehObjeto(d.estatisticas) &&
      ['linhas', 'caracteres', 'bytes'].every((k) => Number.isInteger(d.estatisticas[k])) &&
      bool(d.sucesso) && lexicoValido(d.lexico) && sintaticoValido(d.sintatico);
  }

  function erroPadronizado(d) {
    return ehObjeto(d) && d.recebido === false && ehObjeto(d.erro) &&
      typeof d.erro.codigo === 'string' && typeof d.erro.mensagem === 'string';
  }

  async function enviarCodigo(codigo, opcoes = {}) {
    const config = window.APP_CONFIG || {};
    const tempoLimite = opcoes.tempoLimiteMs || config.tempoLimiteMs || TEMPO_LIMITE_PADRAO_MS;
    const controle = new window.AbortController();
    const temporizador = setTimeout(() => controle.abort(), tempoLimite);
    try {
      const resp = await window.fetch(ROTA_ANALISAR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
        signal: controle.signal,
      });
      let corpo;
      try { corpo = await resp.json(); } catch (e) {
        if (controle.signal.aborted) return { tipo: 'falha', motivo: 'tempo' };
        corpo = undefined;     // corpo vazio ou não-JSON (ex.: página de erro do Nginx)
      }
      if (resp.ok) {
        return respostaSucessoValida(corpo)
          ? { tipo: 'sucesso', dados: corpo }
          : { tipo: 'falha', motivo: 'resposta-invalida', status: resp.status };
      }
      if (erroPadronizado(corpo)) return { tipo: 'rejeitado', status: resp.status, erro: corpo.erro };
      return { tipo: 'falha', motivo: 'http', status: resp.status };
    } catch (e) {
      return { tipo: 'falha', motivo: controle.signal.aborted ? 'tempo' : 'rede' };
    } finally {
      clearTimeout(temporizador);
    }
  }

  let gramaticaEmCache = null;
  async function obterGramatica(opcoes = {}) {
    if (gramaticaEmCache) return gramaticaEmCache;
    const config = window.APP_CONFIG || {};
    const controle = new window.AbortController();
    const temporizador = setTimeout(() => controle.abort(),
      opcoes.tempoLimiteMs || config.tempoLimiteMs || TEMPO_LIMITE_PADRAO_MS);
    try {
      const resp = await window.fetch(ROTA_GRAMATICA, { signal: controle.signal });
      const corpo = resp.ok ? await resp.json() : undefined;
      if (resp.ok && ehObjeto(corpo) && ehObjeto(corpo.tabela) && lista(corpo.producoes)) {
        gramaticaEmCache = { tipo: 'sucesso', dados: corpo };
        return gramaticaEmCache;
      }
      return { tipo: 'falha', motivo: resp.ok ? 'resposta-invalida' : 'http', status: resp.status };
    } catch (e) {
      return { tipo: 'falha', motivo: controle.signal.aborted ? 'tempo' : 'rede' };
    } finally {
      clearTimeout(temporizador);
    }
  }

  window.ApiCompiladores = { enviarCodigo, obterGramatica, ROTA_ANALISAR, ROTA_GRAMATICA };
})();
