// Apresentação da análise léxica na interface (Etapa 3 do roteiro), com backend simulado.
// Os tokens e erros usados aqui são os que o scanner real produz (ver backend/tests/test_scanner.py).
import { describe, it, expect } from 'vitest';
import { carregar, esperar, clicarAnalisar, contarLinhas } from './helpers.js';

const tokensDe = {
  'x = 5\n': [
    { tipo: 'IDENTIFICADOR', lexema: 'x', linha: 1, coluna: 1 },
    { tipo: 'OPERADOR', lexema: '=', linha: 1, coluna: 3 },
    { tipo: 'LITERAL_INTEIRO', lexema: '5', linha: 1, coluna: 5 },
    { tipo: 'QUEBRA_DE_LINHA', lexema: '\n', linha: 1, coluna: 6 },
  ],
};

// Resposta 200 completa, no formato do contrato, para um código e seus tokens/erros.
function respostaDoScanner(codigo, tokens, erros = []) {
  return {
    recebido: true, sucesso: erros.length === 0, mensagem: 'Código recebido com sucesso.', codigo,
    estatisticas: { linhas: contarLinhas(codigo), caracteres: codigo.length, bytes: codigo.length },
    tokens, erros,
  };
}

const fetchCom = (corpo, status = 200) => (url) => url === '/api/health'
  ? Promise.resolve({ ok: true, status: 200, json: async () => ({ status: 'ok' }) })
  : Promise.resolve({ ok: status === 200, status, json: async () => corpo });

describe('Análise léxica — apresentação na interface', () => {
  it('mostra a tabela de tokens com tipo, lexema, linha e coluna', async () => {
    const codigo = 'x = 5\n';
    const t = await carregar({ fetchImpl: fetchCom(respostaDoScanner(codigo, tokensDe[codigo])) });
    t.digitar(codigo);
    await clicarAnalisar(t);
    const linhas = [...t.d.querySelectorAll('.tabela-tokens tbody tr')].map((tr) =>
      [...tr.cells].map((c) => c.textContent));
    expect(linhas).toEqual([
      ['IDENTIFICADOR', 'x', '1', '1'],
      ['OPERADOR', '=', '1', '3'],
      ['LITERAL_INTEIRO', '5', '1', '5'],
      ['QUEBRA_DE_LINHA', '\\n', '1', '6'],
    ]);
  });

  it('destaca cada token no código com a classe da sua categoria, sem alterar o texto', async () => {
    const codigo = 'x = 5\n';
    const t = await carregar({ fetchImpl: fetchCom(respostaDoScanner(codigo, tokensDe[codigo])) });
    t.digitar(codigo);
    await clicarAnalisar(t);
    const pre = t.d.getElementById('eco-codigo');
    expect(pre.textContent).toBe(codigo);
    expect(pre.querySelector('.tok-identificador').textContent).toBe('x');
    expect(pre.querySelector('.tok-operador').textContent).toBe('=');
    expect(pre.querySelector('.tok-literal-inteiro').textContent).toBe('5');
  });

  it('mostra a contagem de tokens por categoria', async () => {
    const codigo = 'x = 5\n';
    const t = await carregar({ fetchImpl: fetchCom(respostaDoScanner(codigo, tokensDe[codigo])) });
    t.digitar(codigo);
    await clicarAnalisar(t);
    expect(t.resultados.textContent).toMatch(/Contagem por categoria: identificador: 1 · número inteiro: 1 · operador: 1 · quebra de linha: 1/);
  });

  it('erro léxico: estado de erro, lista com linha e coluna, e o trecho destacado no código', async () => {
    const codigo = 'a = 1 @ 2';
    const tokens = [
      { tipo: 'IDENTIFICADOR', lexema: 'a', linha: 1, coluna: 1 },
      { tipo: 'OPERADOR', lexema: '=', linha: 1, coluna: 3 },
      { tipo: 'LITERAL_INTEIRO', lexema: '1', linha: 1, coluna: 5 },
      { tipo: 'LITERAL_INTEIRO', lexema: '2', linha: 1, coluna: 9 },
    ];
    const erros = [{ tipo: 'ERRO_LEXICO', lexema: '@', linha: 1, coluna: 7, mensagem: "Caractere não reconhecido: '@'" }];
    const t = await carregar({ fetchImpl: fetchCom(respostaDoScanner(codigo, tokens, erros)) });
    t.digitar(codigo);
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.resultados.getAttribute('role')).toBe('alert');
    expect(t.resultados.textContent).toMatch(/Erros léxicos \(1\)/);
    expect(t.resultados.textContent).toMatch(/Linha 1, coluna 7: Caractere não reconhecido: '@'/);
    expect(t.d.querySelector('.tok-erro').textContent).toBe('@');
    expect(t.d.getElementById('eco-codigo').textContent).toBe(codigo);
  });

  it('código só com comentário: sucesso, com o resumo da análise léxica', async () => {
    const codigo = '# nada\n';
    const tokens = [{ tipo: 'QUEBRA_DE_LINHA', lexema: '\n', linha: 1, coluna: 7 }];
    const t = await carregar({ fetchImpl: fetchCom(respostaDoScanner(codigo, tokens)) });
    t.digitar(codigo);
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('info');
    expect(t.resultados.textContent).toMatch(/Análise léxica concluída: 1 tokens identificados, nenhum erro\./);
  });

  it('divergência entre o código enviado e o devolvido: não destaca nem lista tokens como se fossem do código', async () => {
    const enviado = 'x = 5\n';
    const devolvido = { ...respostaDoScanner(enviado, tokensDe[enviado]), codigo: 'outra coisa' };
    const t = await carregar({ fetchImpl: fetchCom(devolvido) });
    t.digitar(enviado);
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.resultados.textContent).toMatch(/Código recebido com divergência/);
    expect(t.d.querySelector('.tok-identificador')).toBeNull();
    expect(t.d.querySelector('.tabela-tokens')).toBeNull();
  });

  it('o texto de explicação define token e lexema', async () => {
    const codigo = 'x = 5\n';
    const t = await carregar({ fetchImpl: fetchCom(respostaDoScanner(codigo, tokensDe[codigo])) });
    t.digitar(codigo);
    await clicarAnalisar(t);
    expect(t.resultados.textContent).toMatch(/Lexema é o trecho exato do código; token é a classificação/);
  });

  it('a interface não quebra com código que contém HTML e caracteres de controle', async () => {
    const codigo = '<img src=x onerror=alert(1)> = "\u0001"\n';
    const erros = [{ tipo: 'ERRO_LEXICO', lexema: '<', linha: 1, coluna: 1, mensagem: "Caractere não reconhecido: '<'" }];
    const t = await carregar({ fetchImpl: fetchCom(respostaDoScanner(codigo, [], erros)) });
    t.digitar(codigo);
    await clicarAnalisar(t);
    expect(t.d.querySelector('img')).toBeNull();                       // HTML nunca é interpretado
    expect(t.d.getElementById('eco-codigo').textContent).toBe(codigo);
  });
});
