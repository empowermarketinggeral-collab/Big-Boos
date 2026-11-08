# Formato do ficheiro `mapa.json` (Mapa de Crescimento → Big Boss)

O módulo "Mapa de Crescimento" de cada marca (`src/modules/growthmap/GrowthMapModule.jsx`,
migração 100) importa um ficheiro JSON com este formato. Cada prioridade passa a uma fase
com as tarefas "O que fazer"; a equipa acrescenta fases e tarefas no Big Boss.
Voltar a importar um mapa atualizado mantém as tarefas já feitas (as fases reconhecem-se
pelo nome da prioridade).

Todos os campos são opcionais, exceto `format`, `version` e pelo menos um de `title`,
`score` ou `prioridades`.

```json
{
  "format": "big-boss-mapa",
  "version": 1,
  "title": "Mapa de Crescimento · <Marca>",
  "marca": "<Marca>",
  "data": "AAAA-MM-DD",
  "headline": "Frase-síntese do mapa",
  "partes": [{ "n": 1, "nome": "Pesquisa", "estado": "Validada" }],
  "blocos": [{ "nome": "Macro mercado", "estado": "Validado", "data": "7 nov" }],
  "score": {
    "nome": "Score B.O.S.S.–MOAT",
    "faixa": "Ajustar",
    "resumo": "Frase sobre o score",
    "nota": "Como ler o score",
    "confirmar": "O que confirmar na reavaliação",
    "reavaliacao": "AAAA-MM-DD",
    "criterios": [{ "criterio": "Margens", "proposta": 8, "validado": 10 }]
  },
  "numeros": { "nota": "De onde vêm", "items": [{ "metrica": "Instagram", "label": "Seguidores no Instagram", "valor": 276 }] },
  "cubo": {
    "nota": "…",
    "decisora": { "nome": "Inês, 42", "descricao": "…" },
    "pessoas": [{ "pessoa": "Sócia", "papel": "Pode vetar", "dor": "…", "desejo": "…", "objecao": "…", "justificacao": "…" }]
  },
  "historias": { "nota": "…", "items": [{ "id": "H1", "pessoa": "…", "objecao": "…", "historia": "…" }] },
  "achados": [{ "id": "1.1", "bloco": "1", "bloco_nome": "Macro mercado", "titulo": "…", "dado": "…", "leitura": "…", "fonte": "…", "confianca": "Alta" }],
  "posicao": {
    "declaracao": "Declaração de posição",
    "nota": "Como ler as dimensões",
    "dimensoes": [{ "dimensao": "Prova", "hoje": 3, "alvo": 4 }],
    "declarada": "…",
    "percebida": "…",
    "espaco_livre": "…"
  },
  "decisoes": [{ "tema": "Nome", "decisao": "…", "porque": "…" }],
  "travoes": {
    "nota": "…",
    "items": [{ "ordem": 1, "peso": "Alto", "titulo": "…", "sintoma": "…", "causa": "…" }],
    "fora": "O que ficou de fora"
  },
  "prioridades": {
    "periodo": "De … a …",
    "nota": "…",
    "items": [{
      "ordem": 1, "prioridade": "…", "resolve": "Causa que resolve",
      "inicio": "jan", "fim": "abr", "periodo": "janeiro a abril",
      "indicador": "…", "meta": "…",
      "tarefas": ["Tarefa 1", "Tarefa 2"]
    }]
  },
  "fonte": "Onde está a pesquisa completa"
}
```

## Texto para acrescentar à skill "mapa-de-crescimento"

> No fim, depois do dashboard publicado, gera também um ficheiro `mapa.json` no formato
> "big-boss-mapa" versão 1 (ver `docs/FORMATO_MAPA_DE_CRESCIMENTO.md` no repositório
> Big-Boos), com os mesmos dados validados do dashboard: partes, blocos, score, números,
> Cliente ao Cubo, histórias, achados, posição, decisões, o que trava e prioridades com as
> tarefas "O que fazer". Entrega o ficheiro para descarregar e diz: "No Big Boss, abre a
> marca, Mapa de Crescimento, Importar mapa, e escolhe este ficheiro."
