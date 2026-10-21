// Programas de exemplo do subconjunto de Python analisado: atribuições da forma
//   identificador = expressão
// com identificadores, números, strings, + - * / e parênteses.
//
// Campos: id, titulo, descricao, demonstra (construções ilustradas), valido, codigo.
// "valido: false" marca exemplos com erro proposital, para explorar as mensagens de erro.
window.EXEMPLOS = [
  // ---------- Programas válidos ----------
  {
    id: 'atribuicao-simples',
    titulo: 'Atribuição simples',
    descricao: 'Uma atribuição de um número a um identificador.',
    demonstra: 'identificador, "=", número',
    valido: true,
    codigo: 'x = 5\n',
  },
  {
    id: 'operacao-aritmetica',
    titulo: 'Operação aritmética',
    descricao: 'Uma soma de dois números atribuída a uma variável.',
    demonstra: 'expressão com operador binário "+"',
    valido: true,
    codigo: 'resultado = 10 + 5\n',
  },
  {
    id: 'expressao-parenteses',
    titulo: 'Precedência e parênteses',
    descricao: 'Mostra que * e / têm precedência sobre + e -, e como os parênteses alteram a ordem.',
    demonstra: 'precedência de operadores, parênteses, todos os operadores (+ - * /)',
    valido: true,
    codigo: 'total = 2 + 3 * 4\nmedia = (2 + 3) * 4 / 2 - 1\n',
  },
  {
    id: 'variaveis-encadeadas',
    titulo: 'Várias atribuições com variáveis',
    descricao: 'Um pequeno programa em que uma atribuição usa variáveis definidas antes.',
    demonstra: 'lista de atribuições, identificadores dentro de expressões',
    valido: true,
    codigo: 'preco = 10\nqtd = 3\ntotal = preco * (qtd + 1)\n',
  },
  {
    id: 'strings',
    titulo: 'Textos (strings)',
    descricao: 'Atribuição de textos entre aspas e concatenação com +.',
    demonstra: 'literal string, concatenação com "+"',
    valido: true,
    codigo: 'nome = "Ana"\nsaudacao = "Olá, " + nome\n',
  },

  // ---------- Programas com erro intencional ----------
  {
    id: 'erro-operando-ausente',
    titulo: 'Operando ausente',
    descricao: 'Após o operador + era esperado um identificador, número, texto ou "(".',
    demonstra: 'erro sintático: fim de linha onde se esperava um operando',
    valido: false,
    codigo: 'x = 5 +\ny = 2\n',
  },
  {
    id: 'erro-sem-expressao',
    titulo: 'Atribuição sem expressão',
    descricao: 'Depois do "=" era esperada uma expressão.',
    demonstra: 'erro sintático: expressão ausente após "="',
    valido: false,
    codigo: 'x =\n',
  },
  {
    id: 'erro-parenteses',
    titulo: 'Parêntese não fechado',
    descricao: 'O parêntese aberto não possui o ")" correspondente.',
    demonstra: 'erro sintático: ")" esperado',
    valido: false,
    codigo: 'total = preco * (qtd + 1\n',
  },
  {
    id: 'erro-sem-igual',
    titulo: 'Falta o sinal "="',
    descricao: 'Depois do identificador era esperado o símbolo "=".',
    demonstra: 'erro sintático: "=" esperado após o identificador',
    valido: false,
    codigo: 'x 5\n',
  },
  {
    id: 'erro-fora-do-escopo',
    titulo: 'Construção fora do subconjunto',
    descricao: 'O comando if não faz parte do subconjunto analisado.',
    demonstra: 'limite do escopo: estruturas de controle não são aceitas',
    valido: false,
    codigo: 'x = 5\nif x > 3:\n    y = 1\n',
  },
];
