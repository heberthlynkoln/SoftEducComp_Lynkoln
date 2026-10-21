import { describe, it, expect } from 'vitest';
import { carregar, backendSimulado, ArmazenamentoFalso, esperar, clicarAnalisar, erroApi, sucessoApi } from './helpers.js';

// ---------- Etapa 2: elementos da tela ----------
describe('Elementos da tela', () => {
  it('identifica o sistema e a linguagem analisada', async () => {
    const { d } = await carregar();
    expect(d.getElementById('nome-sistema').textContent).toMatch(/Visualizador de Análise Sintática/);
    expect(d.getElementById('linguagem').textContent).toMatch(/Linguagem analisada.*Python/);
  });

  it('possui textarea com rótulo, botão Analisar e área de resultados', async () => {
    const { d, area, analisar, resultados } = await carregar();
    expect(area.tagName).toBe('TEXTAREA');
    expect(d.querySelector('label[for="codigo"]')).not.toBeNull();
    expect(analisar.textContent.trim()).toBe('Analisar');
    expect(resultados.dataset.estado).toBe('inicial');
    expect(resultados.textContent).toMatch(/aparecerão aqui/);
  });

  it('o seletor tem todos os exemplos, válidos e com erro', async () => {
    const { w, seletor } = await carregar();
    const ids = [...seletor.options].map((o) => o.value).filter(Boolean);
    expect(ids.length).toBe(w.EXEMPLOS.length);
    expect(w.EXEMPLOS.some((e) => e.valido)).toBe(true);
    expect(w.EXEMPLOS.some((e) => !e.valido)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    w.EXEMPLOS.forEach((e) => {
      expect(e.titulo && e.descricao).toBeTruthy();
      expect(e.codigo.trim()).not.toBe('');
    });
  });

  it('o campo aceita o tamanho máximo definido', async () => {
    const { area } = await carregar();
    expect(area.maxLength).toBe(100000);
  });
});

// ---------- Etapa 2 (adaptado): interações ----------
describe('Interações', () => {
  it('escolher um exemplo preenche o editor e a descrição', async () => {
    const t = await carregar();
    const ex = t.w.EXEMPLOS[1];
    t.escolher(ex.id);
    expect(t.area.value).toBe(ex.codigo);
    expect(t.d.getElementById('descricao-exemplo').textContent).toBe(ex.descricao);
  });

  it('todos os exemplos são carregados e enviados sem alteração', async () => {
    const t = await carregar();
    for (const ex of t.w.EXEMPLOS) {
      t.escolher(ex.id);
      expect(t.area.value).toBe(ex.codigo);
      await clicarAnalisar(t);
      expect(JSON.parse(t.chamadas.at(-1).opcoes.body).codigo).toBe(ex.codigo);
      expect(t.resultados.dataset.estado).toBe('info');
    }
  });

  it('exemplos com erro são aceitos (o sistema não presume código válido)', async () => {
    const t = await carregar();
    for (const ex of t.w.EXEMPLOS.filter((e) => !e.valido)) {
      t.escolher(ex.id);
      await clicarAnalisar(t);
      expect(t.resultados.dataset.estado).toBe('info');
      expect(t.d.getElementById('eco-codigo').textContent).toBe(ex.codigo);
    }
  });

  it('trocar de exemplo limpa o resultado anterior', async () => {
    const t = await carregar();
    t.digitar('x = 1');
    await clicarAnalisar(t);
    t.escolher(t.w.EXEMPLOS[0].id);
    expect(t.resultados.dataset.estado).toBe('inicial');
  });

  it('o contador acompanha o texto, inclusive com CRLF', async () => {
    const t = await carregar();
    const c = t.d.getElementById('contador');
    t.digitar('a = 1\nb = 2\nc = 3');
    expect(c.textContent).toMatch(/^3 linhas · 17 caracteres/);
    t.digitar('a = 1');
    expect(c.textContent).toMatch(/^1 linha · 5 caracteres/);
    t.digitar('a\r\nb\r\n');
    expect(c.textContent).toMatch(/^2 linhas/);
    t.digitar('');
    expect(c.textContent).toMatch(/^0 linhas · 0 caracteres/);
  });

  it('o contador conta pontos de código Unicode (emoji = 1 caractere)', async () => {
    const t = await carregar();
    t.digitar('a = "😀"');
    expect(t.d.getElementById('contador').textContent).toMatch(/^1 linha · 7 caracteres/);
  });

  it('Ctrl+Enter aciona a análise', async () => {
    const t = await carregar();
    t.digitar('x = 1');
    t.area.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await esperar(); await esperar();
    expect(t.chamadas.length).toBe(1);
  });
});

// ---------- Etapa 3: edição ----------
describe('Edição do código', () => {
  it('começa com um código inicial editável', async () => {
    const t = await carregar();
    expect(t.area.value.trim()).not.toBe('');
    expect(t.area.readOnly).toBe(false);
    expect(t.area.disabled).toBe(false);
  });

  it('o código inicial pode ser substituído por outro', async () => {
    const t = await carregar();
    t.digitar('novo = 42\n');
    expect(t.area.value).toBe('novo = 42\n');
    await clicarAnalisar(t);
    expect(JSON.parse(t.chamadas[0].opcoes.body).codigo).toBe('novo = 42\n');
  });

  it('o conteúdo existente pode ser editado (acrescentar e alterar)', async () => {
    const t = await carregar();
    t.escolher(t.w.EXEMPLOS[0].id);
    const original = t.area.value;
    t.digitar(original + 'z = 9\n');
    t.digitar(t.area.value.replace('x = 5', 'x = 6'));
    expect(t.area.value).toBe('x = 6\nz = 9\n');
  });

  it('é possível experimentar entradas diferentes em sequência', async () => {
    const t = await carregar();
    const entradas = ['a = 1', 'b = (2', '= = =', 'c = "ok"'];
    for (const e of entradas) { t.digitar(e); await clicarAnalisar(t); }
    expect(t.chamadas.map((c) => JSON.parse(c.opcoes.body).codigo)).toEqual(entradas);
  });

  it('Limpar apaga código, exemplo, descrição e resultados', async () => {
    const t = await carregar();
    t.escolher(t.w.EXEMPLOS[0].id);
    await clicarAnalisar(t);
    t.limpar.click();
    expect(t.area.value).toBe('');
    expect(t.seletor.value).toBe('');
    expect(t.d.getElementById('descricao-exemplo').textContent).toBe('');
    expect(t.resultados.dataset.estado).toBe('inicial');
  });
});

// ---------- Etapa 3: preservação ----------
describe('Preservação do código', () => {
  it('o texto permanece no editor após analisar, com sucesso', async () => {
    const t = await carregar();
    t.digitar('  x = 5  \n');
    await clicarAnalisar(t);
    expect(t.area.value).toBe('  x = 5  \n');
  });

  it('o texto permanece no editor quando o backend falha (HTTP 500)', async () => {
    const chamadas = [];
    const t = await carregar({ fetchImpl: backendSimulado(chamadas, { status: 500 }) });
    t.digitar('x = 5 +');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.area.value).toBe('x = 5 +');
  });

  it('o texto permanece quando a rede falha', async () => {
    const t = await carregar({
      fetchImpl: (url) => url === '/api/health'
        ? Promise.reject(new Error('offline')) : Promise.reject(new Error('offline')),
    });
    t.digitar('x = 5');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.resultados.textContent).toMatch(/continua no editor/);
    expect(t.area.value).toBe('x = 5');
  });

  it('o texto permanece ao recarregar a página', async () => {
    const armazenamento = new ArmazenamentoFalso();
    const a = await carregar({ armazenamento });
    a.digitar('x = 5 +\n  y\t= "ç"');
    const b = await carregar({ armazenamento });
    expect(b.area.value).toBe('x = 5 +\n  y\t= "ç"');
  });

  it('um editor apagado continua vazio após recarregar (não volta ao inicial)', async () => {
    const armazenamento = new ArmazenamentoFalso();
    const a = await carregar({ armazenamento });
    a.limpar.click();
    const b = await carregar({ armazenamento });
    expect(b.area.value).toBe('');
  });

  it('um exemplo carregado também é preservado', async () => {
    const armazenamento = new ArmazenamentoFalso();
    const a = await carregar({ armazenamento });
    a.escolher(a.w.EXEMPLOS[2].id);
    const b = await carregar({ armazenamento });
    expect(b.area.value).toBe(a.w.EXEMPLOS[2].codigo);
  });

  it('funciona normalmente se o armazenamento do navegador estiver bloqueado', async () => {
    const t = await carregar({ semStorage: true });
    expect(t.area.value.trim()).not.toBe('');
    t.digitar('x = 1');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('info');
  });
});

// ---------- Etapa 3: envio ----------
describe('Envio do código ao backend', () => {
  it('envia POST /api/analisar com JSON { codigo }', async () => {
    const t = await carregar();
    t.digitar('x = 5\n');
    await clicarAnalisar(t);
    expect(t.chamadas.length).toBe(1);
    const { url, opcoes } = t.chamadas[0];
    expect(url).toBe('/api/analisar');
    expect(opcoes.method).toBe('POST');
    expect(opcoes.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opcoes.body)).toEqual({ codigo: 'x = 5\n' });
  });

  it('código válido: mostra contagens e o eco do que o backend recebeu', async () => {
    const t = await carregar();
    t.digitar('x = 5\ny = 2\n');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('info');
    expect(t.resultados.textContent).toMatch(/Código recebido/);
    expect(t.resultados.textContent).toMatch(/2 linhas, 12 caracteres/);
    expect(t.d.getElementById('eco-codigo').textContent).toBe('x = 5\ny = 2\n');
  });

  it('texto vazio não é enviado e gera mensagem de validação', async () => {
    const t = await carregar();
    t.digitar('');
    await clicarAnalisar(t);
    expect(t.chamadas.length).toBe(0);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.resultados.getAttribute('role')).toBe('alert');
    expect(t.resultados.textContent).toMatch(/Informe um código-fonte antes de solicitar a análise\./);
  });

  it.each([[' '], ['   \n  \n'], ['\t\t'], ['\n\n\n']])(
    'apenas espaços em branco (%j) não é enviado e gera mensagem específica', async (texto) => {
      const t = await carregar();
      t.digitar(texto);
      await clicarAnalisar(t);
      expect(t.chamadas.length).toBe(0);
      expect(t.resultados.dataset.estado).toBe('erro');
      expect(t.resultados.textContent).toMatch(/apenas espaços em branco/);
      expect(t.area.value).toBe(texto);
    });

  it.each([
    ['espaços nas pontas', '   x = 1   \n\n'],
    ['tabulações', 'x\t=\t5\n\ty = 1'],
    ['acentos e unicode', 'nome = "Olá, João ✓ 😀 日本語"\n'],
    ['aspas e barras', 'a = "aspas \\" e \\\\ barra" + \'simples\''],
    ['HTML', '<script>alert(1)</script> = "<b>x</b>" & &amp;'],
    ['SQL', "x = '; DROP TABLE t; --"],
    ['símbolos fora do escopo', '@#$%¨&* ~^`´ {}[]|\\ ?;:'],
    ['caractere nulo', 'x = 1\u0000'],
    ['linha muito longa', 'x = ' + '1 + '.repeat(5000) + '1'],
  ])('envia sem alterar: %s', async (_nome, texto) => {
    const t = await carregar();
    t.digitar(texto);
    await clicarAnalisar(t);
    expect(JSON.parse(t.chamadas[0].opcoes.body).codigo).toBe(texto);
    expect(t.d.getElementById('eco-codigo').textContent).toBe(texto);
    expect(t.resultados.dataset.estado).toBe('info');
  });

  it.each([
    ['operando ausente', 'x = 5 +\ny = 2\n'],
    ['parêntese aberto', 'total = preco * (qtd + 1\n'],
    ['sem igual', 'x 5\n'],
    ['fora do escopo', 'if x > 3:\n    y = 1\n'],
    ['lixo', ')))= = ((('],
  ])('código com erro intencional é aceito e enviado: %s', async (_nome, texto) => {
    const t = await carregar();
    t.digitar(texto);
    await clicarAnalisar(t);
    expect(t.chamadas.length).toBe(1);
    expect(t.resultados.dataset.estado).toBe('info');
  });

  it('quebras de linha CRLF coladas no campo chegam normalizadas como LF (regra do <textarea>)', async () => {
    const t = await carregar();
    t.digitar('x = 1\r\ny = 2\r\n');
    await clicarAnalisar(t);
    expect(JSON.parse(t.chamadas[0].opcoes.body).codigo).toBe('x = 1\ny = 2\n');
  });

  it('mostra HTML do código como texto, sem interpretá-lo', async () => {
    const t = await carregar();
    t.digitar('<img src=x onerror=alert(1)>');
    await clicarAnalisar(t);
    expect(t.resultados.querySelector('img')).toBeNull();
    expect(t.d.getElementById('eco-codigo').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('sinaliza divergência se o backend devolver texto diferente', async () => {
    const t = await carregar({ fetchImpl: backendSimulado([], { alterar: true }) });
    t.digitar('x = 1');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.resultados.textContent).toMatch(/divergência/);
  });

  it('erro HTTP do backend gera mensagem de erro', async () => {
    const t = await carregar({ fetchImpl: backendSimulado([], { status: 500, semJson: true }) });
    t.digitar('x = 1');
    await clicarAnalisar(t);
    expect(t.resultados.dataset.estado).toBe('erro');
    expect(t.resultados.textContent).toMatch(/erro inesperado/);
  });

  it('o botão fica desabilitado durante o envio e volta ao final', async () => {
    let liberar;
    const t = await carregar({
      fetchImpl: (url) => url === '/api/health'
        ? Promise.resolve({ ok: true, json: async () => ({}) })
        : new Promise((res) => { liberar = () => res({ ok: true, json: async () => sucessoApi('x = 1') }); }),
    });
    t.digitar('x = 1');
    t.analisar.click();
    await esperar();
    expect(t.analisar.disabled).toBe(true);
    liberar(); await esperar(); await esperar();
    expect(t.analisar.disabled).toBe(false);
    expect(t.resultados.dataset.estado).toBe('info');
  });

  it('resposta atrasada não sobrescreve a tela depois de Limpar', async () => {
    let liberar;
    const t = await carregar({
      fetchImpl: (url) => url === '/api/health'
        ? Promise.resolve({ ok: true, json: async () => ({}) })
        : new Promise((res) => { liberar = () => res({ ok: true, json: async () => sucessoApi('x = 1') }); }),
    });
    t.digitar('x = 1');
    t.analisar.click();
    await esperar();
    t.limpar.click();
    liberar(); await esperar(); await esperar();
    expect(t.resultados.dataset.estado).toBe('inicial');
    expect(t.analisar.disabled).toBe(false);
  });
});

// ---------- Etapa 2: status do backend ----------
describe('Status do backend', () => {
  it('mostra "conectado" quando /api/health responde', async () => {
    const t = await carregar();
    await esperar();
    expect(t.d.getElementById('status-backend').dataset.estado).toBe('ok');
  });

  it('mostra indisponível sem quebrar a tela', async () => {
    const t = await carregar({ fetchImpl: () => Promise.reject(new Error('offline')) });
    await esperar();
    expect(t.d.getElementById('status-backend').dataset.estado).toBe('erro');
    t.digitar('');
    t.analisar.click();
    expect(t.resultados.dataset.estado).toBe('erro');
  });
});
