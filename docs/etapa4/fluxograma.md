# Fluxograma do processamento

Figura para a seção **Materiais e Métodos** do artigo: [fluxograma.svg](fluxograma.svg) (vetorial) e [fluxograma.png](fluxograma.png) (para inserir no documento).

Legenda: verde = implementado; amarelo = decisão; vermelho = retorno de erro ao usuário; cinza tracejado = pendente (Etapa 5); azul = usuário e interface.

O mesmo fluxo, em texto (Mermaid):

```mermaid
flowchart TD
  U([Usuário digita ou escolhe um exemplo e clica em Analisar]) --> VF[Validação na interface]
  VF -- inválido --> EF[Mensagem na tela; nada é enviado]
  VF -- POST /api/analisar --> VB[Validação no backend]
  VB -- inválido --> EB[HTTP 422 / 413, erro padronizado]
  VB --> SC[Análise léxica: tokens e erros léxicos]
  SC --> DL{Há erro léxico?}
  DL -- sim --> EL[Erros léxicos; parser NÃO executado - D1]
  DL -- não --> PA[Parser LL1: pilha + tabela M, ações semânticas, passo a passo]
  PA --> DS{Célula vazia ou terminal não casou?}
  DS -- sim --> ES[1º erro sintático: posição, encontrado, esperados, explicação, regra; árvore parcial - D4]
  DS -- não --> AST[AST construída]
  AST -.-> SEM[Análise semântica - Etapa 5, pendente]
  SEM -.-> R[Resposta JSON HTTP 200]
  EL --> R
  ES --> R
  R --> I([Interface: erros por fase, código destacado, AST navegável, tokens, passo a passo, tabela M])
```

Pontos de retorno de erro ao usuário, sempre em blocos separados: (i) validação da entrada; (ii) erros léxicos; (iii) erro sintático, com posição, tokens esperados e explicação; (iv) erros semânticos (Etapa 5, pendente).
