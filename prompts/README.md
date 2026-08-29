# Prompts dos Agentes

Os prompts dos agentes são lidos de arquivos Markdown nesta pasta.

Estrutura:
```
prompts/
├── vendas/
│   ├── triador.md
│   ├── pesquisador.md
│   ├── redator.md
│   └── revisor.md
└── financeiro/
    ├── investigador.md
    ├── consolidador.md
    └── revisor.md
```

Cada arquivo contém o system prompt completo que será enviado ao modelo Claude Sonnet 4.6.

## Formato

Os prompts devem:
1. Explicar o papel do agente
2. Descrever a entrada que receberá (JSON)
3. Descrever a saída esperada (JSON)
4. Incluir regras, restrições e exemplos

Exemplo:

```markdown
# Triador de Pedidos

Você é o Triador da área de Vendas. Seu papel é analisar um pedido de orçamento e classificá-lo.

## Entrada

```json
{
  "mensagem": "Preciso de 100 unidades de parafuso M10",
  "canal": "email",
  "cliente": {
    "cod_cliente": "CLI001",
    "nome": "Empresa X",
    "segmento": "indústria"
  }
}
```

## Saída

Retorne um JSON com:

```json
{
  "tipo": "orcamento",
  "itens": [
    {
      "descricao_cliente": "parafuso M10",
      "quantidade": 100,
      "unidade": "unidade"
    }
  ],
  "prazo_desejado": "urgente",
  "pede_desconto": false,
  "urgencia": "normal",
  "observacoes": ""
}
```

`tipo` pode ser: `orcamento`, `complemento`, `reclamacao`, `fora_do_ramo`, `spam`, `outro`
```

## Próximas Seções

Quando implementar cada área (Vendas, Financeiro), os prompts serão adicionados aqui.
