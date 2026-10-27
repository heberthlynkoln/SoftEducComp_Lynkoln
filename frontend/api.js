// Comunicação com o backend (contrato em docs/API.md).
// Concentra o acesso HTTP para que app.js só se preocupe em exibir resultados.
//
// enviarCodigo(codigo) sempre RESOLVE (nunca lança) com um destes objetos:
//   { tipo: 'sucesso',   dados }                  HTTP 200 no formato do contrato (inclui tokens e erros léxicos;
//                                                 `dados.sucesso` é false quando há erros léxicos)
//   { tipo: 'rejeitado', status, erro }           erro no formato padrão (400, 413, 422...)
//   { tipo: 'falha',     motivo, status? }        motivo: 'rede' | 'tempo' | 'http' | 'resposta-invalida'
(function () {
  const TEMPO_LIMITE_PADRAO_MS = 10000;
  const ROTA_ANALISAR = '/api/analisar';

  const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  const ehToken = (t) => ehObjeto(t) && typeof t.tipo === 'string' && typeof t.lexema === 'string' &&
    Number.isInteger(t.linha) && Number.isInteger(t.coluna);
  const ehErroLexico = (e) => ehToken(e) && typeof e.mensagem === 'string';

  function respostaSucessoValida(d) {
    return ehObjeto(d) && d.recebido === true && typeof d.mensagem === 'string' &&
      typeof d.codigo === 'string' && ehObjeto(d.estatisticas) &&
      ['linhas', 'caracteres', 'bytes'].every((k) => Number.isInteger(d.estatisticas[k])) &&
      typeof d.sucesso === 'boolean' &&
      Array.isArray(d.tokens) && d.tokens.every(ehToken) &&
      Array.isArray(d.erros) && d.erros.every(ehErroLexico) &&
      d.sucesso === (d.erros.length === 0);   // sucesso só quando não há erros léxicos
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

  window.ApiCompiladores = { enviarCodigo, ROTA_ANALISAR };
})();
