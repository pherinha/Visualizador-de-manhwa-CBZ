# Plano por fases: do alicerce à entrega final

Projeto: Visualizador de Manhwa CBZ
Documento irmão de `PLANO-DRIVE-E-ARMAZENAMENTO.md` (o plano completo, com telas, dados e decisões). Aqui o conteúdo é o mesmo, reorganizado **por ordem de construção**: cada fase só existe depois do que ela precisa, e termina com o app funcionando.

> **Status:** plano. Nada foi implementado ainda. Tamanhos são relativos (P, M, G), não prazos.

---

## 1. Como a ordem foi decidida

| # | Regra | Efeito na ordem |
|---|---|---|
| 1 | **Dados antes de tela.** Nenhuma tela é construída sem o dado que a sustenta. | Banco v2 e migração vêm antes de qualquer interface nova. |
| 2 | **Proteger o que o leitor já tem antes de criar mais.** | Regras de remoção, progresso e último ponto vêm antes do download. |
| 3 | **Risco desconhecido cedo.** O que pode mudar o desenho é testado primeiro, em separado. | Um teste descartável (Fase 0) decide o modo de implantação antes de gastar tempo no resto. |
| 4 | **Cada fase termina com o app usável.** | Nenhuma fase deixa o app quebrado entre uma e outra. |
| 5 | **A parte que depende de serviço externo vem depois da parte que não depende.** | A trilha local (Fases 1 a 3) entrega valor sem Drive, Worker ou chave do Google. |
| 6 | **O que é complexidade opcional fica por último.** | Downloads em paralelo, CSP imposta e limite de taxa ficam no acabamento. |

---

## 2. Visão geral

| Fase | Nome | Depende de | O que o leitor ganha | Tamanho |
|---|---|---|---|---|
| **0** | Preparação e validação de riscos | — | Nada visível. Fecha decisões e dá base de testes. | M |
| **1** | Alicerce de dados | 0A | Nada visível. O app abre igual, com banco novo e progresso seguro. | G |
| **2** | Último ponto e ordenação | 1 | "Parou: cap. 47", continuar leitura, ordenar obras e capítulos. | M |
| **3** | Gerenciador de espaço e limpeza | 1, 2 | Armazenamento, apagar, esquecer, remover obra, limpar cache. **Marco: Release 1.** | G |
| **4** | Servidor e segurança | 0B | Worker publicado, com código obrigatório. Ainda sem interface. | M |
| **5** | Conexão do app com o servidor | 3, 4 | Ajustes → Conexão, detecção de servidor, teste de código. | M |
| **6** | Catálogo e seleção | 5 | Colar link, ver capítulos, escolher quantos (sem baixar ainda). | M |
| **7** | Download e vinculação | 6, 1 | Baixar do Drive com progresso. **Marco: Release 2.** | G |
| **8** | Vínculo vivo | 7, 3 | Só vinculado, baixar de novo, vincular mais, verificar novos. | M |
| **9** | Acabamento e endurecimento | todas | 2 downloads, CSP imposta, limite de taxa, README. **Marco: Release 3.** | M |

---

## 3. Grafo de dependências

```text
TRILHA LOCAL (não depende de Drive nem de servidor)
  F0A ──► F1 ──► F2 ──► F3 ═══► RELEASE 1
          │             │
          │             └──────────────┐ (aba "Biblioteca" nos Ajustes)
          │                            ▼
TRILHA DO SERVIDOR                    F5 ──► F6 ──► F7 ═══► RELEASE 2 ──► F8 ──► F9 ═══► RELEASE 3
  F0B ──► F4 ──────────────────────────┘             ▲
          (servidor pronto)                          │
                                                     └── F1 (writeStream, remoção, progresso)
```

Leitura do grafo:

- **F1 é a raiz da trilha local.** Tudo o que mexe em obra, capítulo, progresso ou espaço depende dela.
- **F4 não depende de F1 a F3.** Só precisa do resultado do teste da Fase 0. Pode andar em paralelo com a trilha local, se houver mais de uma pessoa trabalhando.
- **F5 é o ponto de encontro** das duas trilhas: precisa da aba "Biblioteca" (F3) e do servidor pronto (F4).
- **F7 depende também de F1**, porque o download grava em fluxo pela camada de dados.

### Sequência recomendada para uma pessoa só

```text
0A → 0B → 1 → 2 → 3 (Release 1) → 4 → 5 → 6 → 7 (Release 2) → 8 → 9 (Release 3)
```

O teste 0B vem logo no início porque é curto e pode mudar o desenho (modo A ou B). Depois disso, a ordem linear segue as dependências.

---

## Fase 0: Preparação e validação de riscos

**Objetivo:** ter base para testar o que vai ser escrito e descobrir cedo o que pode derrubar o desenho.
**Depende de:** nada.
**Por que primeiro:** as Fases 1 a 3 precisam de testes automáticos para a migração do banco ser segura, e a Fase 4 depende das respostas do teste de risco.

### 0A. Base do repositório e dos testes (P)

| Tarefa | Detalhe |
|---|---|
| `.gitignore` | `.dev.vars`, `node_modules/`, arquivos locais. Evita publicar segredo por engano. |
| `package.json` (só para desenvolvimento) | O site continua sem build. O `package.json` serve só para rodar testes e o Wrangler. |
| Pasta `tests/` | Executor do Node (`node --test`), com `fake-indexeddb` e *stubs* de `navigator.storage` (cota e OPFS em memória) para rodar o `library.js` fora do navegador. |
| Dados de teste | Nomes de arquivo variados (`Cap 47`, `Capítulo 12.5`, `Ch.3`, `047`, sem número) e um banco "v1" de exemplo para a migração. |

**Pronto quando:** `node --test` roda e o `library.js` atual carrega no ambiente simulado, com um teste de importação passando.

### 0B. Teste técnico descartável do servidor (M)

Um Worker mínimo (`/api/ping`, `/api/list`, `/api/file`) e uma página de teste, só para responder às perguntas abertas da seção 19.2 do plano principal.

| Pergunta | Como é testada |
|---|---|
| O modo A funciona? (`/api/*` chega ao Worker quando não há arquivo estático com esse caminho; `.assetsignore` exclui o que deve; `_headers` vale para os estáticos) | Deploy real e `curl` nas rotas e nos arquivos. |
| Capítulo grande passa pelo Worker em fluxo? Velocidade e estabilidade. | Baixar um capítulo acima de 100 MB no Android. |
| O OPFS do Chrome do Android grava centenas de MB em fluxo? | Gravar o fluxo direto no OPFS e conferir tamanho e `PK`. |
| O `Range` e o CORS se comportam (modo B)? | Chamada de outro endereço, com `X-Access-Code` no preflight. |
| Links antigos precisam de *resource key*? | Testar com um arquivo compartilhado há muito tempo. |
| `crypto.subtle.timingSafeEqual` existe no runtime? | Chamar no Worker de teste. |
| Como a cota de download do Drive reage? | Observar durante os testes. |

**Saída:** um registro curto do que funcionou e do que não funcionou, e o fechamento de duas decisões em aberto: **modo A ou B** na sua instância e **`.assetsignore` ou pasta `public/`**.
**Descartável:** esse código não entra no produto. O Worker de verdade é escrito na Fase 4, já com o que foi aprendido.

**Fase 0 pronta quando:** os testes automáticos rodam e as duas decisões estão registradas.

---

## Fase 1: Alicerce de dados

**Objetivo:** trocar a base de dados do app sem mudar o que o leitor vê, e deixar prontas todas as operações que as fases seguintes vão chamar.
**Depende de:** 0A.
**Por que agora:** progresso, último ponto, espaço, remoção e download dependem do mesmo banco. Fazer isso por último obrigaria a refazer telas.

### Entregas em `assets/js/library.js`

| # | Entrega | Seção do plano |
|---|---|---|
| 1 | Banco **versão 2**: store `progress` (índice `workId`); campos novos `source`, `lastRead`, `state`, `number`, `remote` | 6.1 a 6.3 |
| 2 | `chapterNumber(nome)`: último número do nome, com decimais e prefixos `Cap`, `Ch`, `Ep`, `#` | 7.4 |
| 3 | API de progresso: ler, gravar, listar por obra, apagar por obra | 6.3 |
| 4 | API de último ponto (`lastRead` na obra) | 7 |
| 5 | **Migração 1 → 2 idempotente:** preenche campos, copia o progresso do `localStorage`, calcula `lastRead`, mantém o `localStorage` antigo por uma versão | 6.4 |
| 6 | **Regras de remoção corrigidas:** obra vazia (3.3); `removeChapter` e `moveChapter` só apagam a obra sem origem e sem último ponto; `renameWork` mescla `source` e `lastRead`; `removeWork` apaga tudo (capítulos, progresso, último ponto, capa) | 8.5 |
| 7 | Operações de capítulo: *remover do aparelho* (vira `cloud` se houver `remote`, senão some o registro), *esquecer*, com opção de apagar progresso | 3.2, 8.3 |
| 8 | `stats()`: peso por obra, capas, total, capítulos no aparelho / total | 8.1, 8.2 |
| 9 | `writeStream(id, fluxo, tamanhoEsperado)`: grava em fluxo, confere tamanho e `PK`, limita o fallback do IndexedDB por tamanho | 14.4 |
| 10 | Núcleo da limpeza: `findOrphans()` e `clearCache()` (sem interface) | 9.3 |

### Entregas em `assets/js/script.js` (só o necessário)

| Entrega | Motivo |
|---|---|
| `savePos` e a leitura da posição passam a usar a API de progresso | O progresso mudou de lugar. |
| `forget()` deixa de apagar o progresso | É o que garante que o progresso sobrevive à remoção do capítulo. |
| Chaves novas de ajuste com padrões (`pickN` 10, `keepRead` 1, `lowSpace` 500 MB, `downloads` 1, `sortLib`, `sortChaps`, `sortStore`) | Ainda sem tela, mas prontas. |

### Critérios de aceite

1. O app com um banco v1 real abre, mostra as mesmas obras e capítulos e **não perde progresso**.
2. A migração rodada **duas vezes** não duplica nada.
3. Se a migração falhar, o app abre com os dados antigos (teste com falha simulada).
4. `removeChapter` do último capítulo de uma obra com último ponto **mantém** a obra vazia.
5. `removeWork` apaga capítulos, arquivos, progresso, último ponto e capa.
6. `renameWork` com duas obras mescla o `lastRead` mais recente e trata duas origens diferentes.
7. `writeStream` recusa arquivo com tamanho divergente ou sem `PK`.

### Testes

Banco (migração v1→v2, duas vezes, com falha), número do capítulo, obra vazia, remoção, espaço (seção 18.1 do plano principal).

### Cuidado antes de publicar

Não há backup do OPFS. Antes de publicar a Release 1, testar a migração **em um aparelho ou perfil com uma biblioteca real v1**, e só então atualizar o aparelho principal.

### Não fazer ainda

Telas novas, ordenação, qualquer coisa do Drive.

**Fase 1 pronta quando:** todos os critérios passam e o app se comporta como antes para quem usa.

---

## Fase 2: Último ponto e ordenação

**Objetivo:** mostrar o dado novo e tornar a biblioteca navegável.
**Depende de:** Fase 1.
**Por que agora:** `lastRead`, `number` e `stats()` já existem; a interface só os apresenta. Vem antes do gerenciador de espaço porque o "Parou:" é parte do cartão da obra que a tela de Armazenamento reutiliza.

### Entregas

| # | Entrega | Seção |
|---|---|---|
| 1 | Gravar `lastRead` ao mudar de página (atraso de ~600 ms), ao sair do leitor e ao terminar o capítulo | 7.2 |
| 2 | Cartão da obra: capa, título, **capítulos no aparelho / total**, **peso**, **"Parou: cap. N"** | 5.1, 7.3 |
| 3 | Tela da obra: bloco "Último ponto" sempre visível, com a situação do arquivo | 5.3, 7.3 |
| 4 | **Continuar** nos casos locais: capítulo no aparelho, capítulo terminado (abre o próximo) e sem arquivo (mostra só o último ponto) | 4.4 |
| 5 | **Obra vazia**: "Sem capítulos no aparelho", com o último ponto à mostra | 3.3 |
| 6 | Cartão "Continuar lendo" na Biblioteca | 7.3 |
| 7 | Ordenação da **Biblioteca** e dos **capítulos**: motor de ordenação, seletor na tela, escolha salva | 10.1, 10.2 |

### Critérios de aceite

1. Ler o cap. 5, sair, apagar o cap. 5 e ver "Parou: cap. 5 · pág. N" no cartão e na obra.
2. Terminar um capítulo faz **Continuar** abrir o próximo.
3. Todas as ordenações das seções 10.1 e 10.2 dão a ordem correta, inclusive com empates e capítulos sem número.
4. A ordenação escolhida continua após fechar e reabrir o app.

### Não fazer ainda

Os casos de **Continuar** que dependem de Drive (baixar de novo, vincular o capítulo): ficam na Fase 8.

**Fase 2 pronta quando:** o leitor vê onde parou em qualquer obra, com ou sem o capítulo.

---

## Fase 3: Gerenciador de espaço e limpeza (Release 1)

**Objetivo:** dar ao leitor controle total sobre o que está no aparelho.
**Depende de:** Fase 1 (`stats`, remoção, limpeza) e Fase 2 (cartão da obra, ordenação).
**Por que agora:** é a funcionalidade de maior valor que **não** depende de Drive, e a aba "Biblioteca" nos Ajustes criada aqui é o lugar onde a Fase 5 vai pendurar a Conexão.

### Entregas

| # | Entrega | Seção |
|---|---|---|
| 1 | Tela **Armazenamento**: barra de uso, por obra, ordenação, estimativas marcadas como "estimado" | 5.4, 8.1, 10.3 |
| 2 | Modo **Selecionar** na obra, com `Apagar do aparelho (X MB)`, `Esquecer` e a opção "também apagar o progresso" | 4.5, 5.3 |
| 3 | **Apagar capítulos já lidos** (mantém `keepRead`, padrão 1) | 4.5, 8.3 |
| 4 | **Remover obra** com a confirmação detalhada em dois toques | 5.7, 8.3 |
| 5 | **Limpar cache** com confirmação e o resultado ("Cache limpo · N MB liberados") | 5.5, 9 |
| 6 | **Aviso de pouco espaço** na Biblioteca, com atalhos | 8.4 |
| 7 | Ícone de Armazenamento na barra da Biblioteca | 5.1 |
| 8 | Ajustes, nova aba **Biblioteca**: Armazenamento, Vinculação (`pickN`, `keepRead`, `lowSpace`) | 5.6 |
| 9 | `sw.js`: aumentar `VERSAO` e publicar | HOSPEDAGEM.md |

Observação: antes de existir o Drive, todos os capítulos são locais. Por isso, nesta fase, **Apagar do aparelho** num capítulo importado do aparelho remove o registro e mantém o último ponto (3.2). O estado "Só vinculado" na interface só aparece na Fase 8.

### Critérios de aceite

1. Importar 3 obras; a soma dos pesos em Armazenamento bate com os capítulos.
2. *Apagar do aparelho* mostra "libera X MB" antes e "Liberou X MB" depois, com os números corretos.
3. *Apagar lidos* mantém 1 por padrão e respeita o valor alterado em Ajustes.
4. *Esquecer* preserva o último ponto; com a opção marcada, apaga também o progresso.
5. *Remover obra* apaga **tudo** da obra e a confirmação mostra os números certos.
6. *Limpar cache* não toca em capítulos, vínculos, progresso, posters, ajustes nem conexão.
7. *Restaurar padrões* não apaga a biblioteca.
8. O aviso de pouco espaço aparece abaixo do limite configurado e **não bloqueia** nenhuma importação.

### Marco: Release 1

O app já entrega, **sem nenhum serviço externo**: último ponto, ordenação, armazenamento, limpeza e remoção. Pode ser publicado e usado como está. Tudo o que vem depois soma, não corrige.

**Gate da Release 1:** testes manuais 4, 6, 7 e 8 da seção 18.2 do plano principal (apagar e conferir MB, espaço quase cheio, atualização do service worker com biblioteca cheia, instalado e no navegador comum).

---

## Fase 4: Servidor e segurança

**Objetivo:** ter o Worker publicado e protegido, antes de qualquer tela falar com ele.
**Depende de:** resultado da Fase 0B. **Não depende** das Fases 1 a 3 (pode andar em paralelo com elas).
**Por que antes do cliente:** a segurança é a base do servidor, e o cliente (Fase 5) precisa de algo real para testar. Construir o servidor primeiro permite validar tudo com `curl` e testes, sem interface.

### Entregas

| # | Entrega | Seção |
|---|---|---|
| 1 | `worker/src/index.js`: rotas `/api/ping`, `list`, `meta`, `file`, com `Range`, validação de ID e de tipo, método só `GET` | 11 |
| 2 | **Código de acesso obrigatório**: `ACCESS_CODES`, falha fechado (503), 401 para código errado, comparação em tempo constante, etiqueta opcional | 12.1, 12.2 |
| 3 | Cabeçalho `X-Service: manhwa-drive` em toda resposta | 11.2 |
| 4 | CORS e `ALLOWED_ORIGINS` (modo B), liberando `X-Access-Code` | 11.3, 12 |
| 5 | Suporte a `resourceKey`, atalhos e erros de cota repassados com o motivo | 13.4 |
| 6 | `wrangler.toml` (modo A), `worker/wrangler.api-only.toml` (modo B), `.assetsignore` (ou `public/`, conforme a Fase 0B) | 15.3 |
| 7 | `tools/gerar-codigo.mjs`: gera códigos aleatórios de 24+ caracteres | 12.2 |
| 8 | Testes do Worker chamando `fetch(Request, env)` com o Drive simulado | 18.1 |
| 9 | Publicação real e verificação com `curl` | 15.1 |

### Critérios de aceite

1. Sem `ACCESS_CODES` configurado, **toda** rota `/api/*` responde 503.
2. Código errado ou ausente: 401. Código certo: 200.
3. Origem não permitida (modo B): 403. Preflight com `X-Access-Code` passa.
4. Tipo de arquivo fora de `.cbz`, `.zip` e imagens: 415. ID inválido: 400. Método diferente de `GET`: 405.
5. `Range` é repassado e o `Content-Length` volta ao cliente.
6. Com a chave do Google restrita à Drive API, uma pasta real é listada e um capítulo é baixado por `curl` com o código.
7. Revogar um código (tirando-o da lista) o invalida sem afetar os outros.

### Não fazer ainda

Limite de taxa por IP e CSP imposta (Fase 9). Antes disso, o código longo e aleatório já protege.

**Fase 4 pronta quando:** o servidor está no ar, fechado por padrão, e os critérios passam por `curl` e por testes automáticos.

---

## Fase 5: Conexão do app com o servidor

**Objetivo:** o app descobre o servidor, guarda o código e testa a conexão.
**Depende de:** Fase 3 (aba "Biblioteca" nos Ajustes) e Fase 4 (servidor).
**Por que agora:** nenhuma tela de Drive faz sentido sem conexão válida, e esta fase ainda é pequena e fácil de testar isolada.

### Entregas

| # | Entrega | Seção |
|---|---|---|
| 1 | **`sw.js` passa a ignorar `/api/`** (primeira tarefa da fase: sem isso o modo A serviria `/api/file` do cache) | 14.6 |
| 2 | `assets/js/config.js` (valores padrão opcionais) e `assets/js/remote.js` (base) | 16 |
| 3 | Conexão guardada na chave própria `cbz-reader:conn` (o "Restaurar padrões" não a apaga) | 6.5, 12.3 |
| 4 | **Detecção de servidor**: `GET /api/ping` sem código; `X-Service` presente = servidor existe | 15.4 |
| 5 | Estados da conexão: `ausente`, `sem código`, `código inválido`, `conectado`, `sem internet` | 4.0 |
| 6 | Ajustes → Biblioteca → **Conexão**: servidor (só no modo B), código mascarado, *Testar conexão*, *Esquecer conexão* | 5.6 |
| 7 | Folha **Conectar ao servidor**, aberta ao tocar em Adicionar → Colar link sem conexão | 4.0 |
| 8 | Analisador de links do Drive, com todos os formatos e `resourcekey` | 13.3 |
| 9 | Opção *Colar link do Drive* aparece em Adicionar **só** com servidor presente | 2.4 |
| 10 | `_headers` e `vercel.json`: `no-cache` para `remote.js` e `config.js`; `sw.js` com `VERSAO` aumentada e arquivos novos nos `ESSENCIAIS` | 16 |

### Critérios de aceite

1. Em hospedagem sem servidor, o app **não mostra** *Colar link* e o resto funciona igual.
2. Com servidor e sem código: estado "sem código". Com código errado: "código inválido". Com código certo: "conectado".
3. O código aparece mascarado e nunca vai na URL.
4. `/api/` **nunca** é servido pelo cache do service worker.
5. *Restaurar padrões* e *Limpar cache* não apagam a conexão.
6. Todos os formatos de link da seção 13.3 são reconhecidos, e IDs inválidos ou texto aleatório são recusados.

### Não fazer ainda

Listar pastas e baixar arquivos.

**Fase 5 pronta quando:** o app mostra o estado correto da conexão nos três cenários (sem servidor, sem código, conectado).

---

## Fase 6: Catálogo e seleção

**Objetivo:** ver o que há na pasta do Drive e escolher quanto trazer, sem baixar nada.
**Depende de:** Fase 5 (conexão e analisador de links). Usa também `chapterNumber` e `stats()` da Fase 1 e `pickN` da Fase 3.
**Por que antes do download:** a seleção é a parte com mais interface e mais casos de borda; separá-la do download deixa cada uma testável sozinha, e o catálogo precisa existir antes de haver o que baixar.

### Entregas

| # | Entrega | Seção |
|---|---|---|
| 1 | `remote.catalog(link)`: lista página por página, percorre subpastas, resolve atalhos, ignora lixeira e tipos não suportados (com a contagem) | 4.1, 11.2 |
| 2 | Regras do catálogo: subpasta = obra, `.cbz`/`.zip` = capítulo, `poster` = capa, arquivos soltos na raiz = obra com o nome da pasta | 4.1 |
| 3 | Tela **Vincular do Google Drive**: campo do link, *Colar*, *Buscar*, estados de carregamento e de erro | 5.2 |
| 4 | Lista com caixas de marcação e etiquetas `Novo` e `No aparelho` (a etiqueta `Só vinculado` entra na Fase 8) | 4.2 |
| 5 | Atalhos **Próximos 5 / 10 / 20 / Todos / Nenhum**, com o padrão do usuário (`pickN`) destacado | 4.2 |
| 6 | **Número livre** com *Usar como padrão* e **intervalo** (do cap. X ao Y) | 4.2 |
| 7 | "Próximos N" começa **depois do último capítulo já baixado** | 4.2 |
| 8 | Rodapé fixo: "N capítulos · X MB · cabem / pode faltar espaço", comparando com o livre estimado | 4.2, 8.4 |
| 9 | Ordenação do catálogo (número, tamanho, novos primeiro) | 10.4 |
| 10 | Mensagens de pasta privada, link inexistente e sem internet | 14.2 |

Nesta fase, o botão **Vincular** ainda não baixa: leva à folha de importação, que na Fase 7 passa a iniciar o download.

### Critérios de aceite

1. Uma pasta com 3 subpastas mostra 3 obras, com os posters como capas e as contagens corretas.
2. "Próximos 5" marca exatamente 5 capítulos, depois do último baixado.
3. Alterar o padrão (campo livre ou Ajustes) muda o atalho destacado.
4. O intervalo e a marcação manual somam corretamente os MB do rodapé.
5. Pasta privada e link inexistente mostram a mensagem certa, sem travar a tela.
6. Pastas grandes (várias páginas de listagem) carregam completas.

**Fase 6 pronta quando:** dá para colar um link e montar uma seleção correta, só que ainda sem baixar.

---

## Fase 7: Download e vinculação (Release 2)

**Objetivo:** trazer os capítulos escolhidos para o aparelho, de forma confiável.
**Depende de:** Fase 6 (seleção) e Fase 1 (`writeStream`, banco v2, regras de remoção).
**Por que agora:** é a fase mais delicada e só pode ser construída quando conexão, catálogo e camada de gravação existem e estão testados.

### Entregas

| # | Entrega | Seção |
|---|---|---|
| 1 | Fila de download: **1 por vez** (a opção de 2 fica na Fase 9) | 14.1 |
| 2 | Gravação em fluxo no OPFS, com **verificação de tamanho e de `PK`** antes de registrar | 14.1 |
| 3 | Novas tentativas (2 s, 6 s, 15 s) e tratamento de **401, 503, 403 de cota, 404, 429, sem espaço e sem internet** | 14.2 |
| 4 | Progresso geral ("3 de 8") e do capítulo atual; **Cancelar** apaga o parcial e mantém o que terminou | 14.3 |
| 5 | Integração com a importação atual: folha de importação, nome da obra editável, `poster` como capa, duplicatas pela `sig` | 14.4 |
| 6 | Registro do vínculo: `source` na obra; `remote`, `number`, `state = "local"` no capítulo | 6.1, 6.2 |
| 7 | Cada capítulo concluído é gravado na hora; **Continuar downloads pendentes** ao reabrir | 14.3, 14.5 |
| 8 | `SELF-HOST.md` versão 1 (modo A e modo B) | 15.5 |
| 9 | CSP em modo **somente relatório** (`Report-Only`) e script inline do `index.html` movido para arquivo | 12.4 |

### Critérios de aceite

1. Colar uma pasta com 3 subpastas e escolher "Próximos 5" baixa **exatamente 5** capítulos e cria as obras.
2. Um download interrompido **não deixa arquivo pela metade nem obra vazia**.
3. Capítulo com tamanho divergente ou sem `PK` é descartado e vai para nova tentativa.
4. Um capítulo já baixado (mesma `sig`) não é baixado de novo.
5. Cancelar mantém os capítulos já concluídos.
6. 401 pede o código de novo sem perder o que já foi baixado.
7. Fechar o app no meio e reabrir oferece continuar só o que falta.
8. **Uma pessoa que nunca viu o projeto instala seguindo só o `SELF-HOST.md`**, em cerca de 15 minutos.

### Marco: Release 2

O leitor consegue vincular e baixar capítulos do Drive e gerenciar o espaço. O fluxo principal da funcionalidade está completo.

**Gate da Release 2:** testes manuais 1, 2, 3, 5 e 9 da seção 18.2 (pasta real, capítulo grande, pasta privada e link inexistente, queda de conexão, código errado e revogado) e o teste de instalação por outra pessoa.

**Fase 7 pronta quando:** os critérios passam e o gate da Release 2 foi cumprido.

---

## Fase 8: Vínculo vivo

**Objetivo:** fazer o vínculo com o Drive durar além do primeiro download.
**Depende de:** Fase 7 (existem capítulos vinculados) e Fase 3 (apagar e remover).
**Por que agora:** só faz sentido ter capítulo "só vinculado" e "baixar de novo" depois que existem capítulos vinculados de verdade.

### Entregas

| # | Entrega | Seção |
|---|---|---|
| 1 | **Apagar do aparelho** vira `cloud` para capítulos com `remote`; etiqueta **Só vinculado** com ícone de nuvem | 3.2, 5.3 |
| 2 | **Baixar de novo** (capítulo e seleção) | 8.3 |
| 3 | **Vincular mais capítulos**: reabre o catálogo da mesma origem, sugerindo os próximos | 4.3 |
| 4 | **Verificar novos capítulos**: compara a pasta atual com o que o app conhece e destaca as novidades | 4.3 |
| 5 | **Continuar** nos casos com Drive: *Baixar de novo e continuar* (mostra o tamanho) e *Vincular o cap. N* (capítulo esquecido, procurado pelo número) | 4.4 |
| 6 | Peso "para baixar de novo" (os `cloud`) em Armazenamento e na obra | 8.2 |
| 7 | **Remover obra** com capítulos `cloud`: apaga também esses registros e o vínculo | 8.3 |
| 8 | Mescla de obras com **origens diferentes**: confirmação ou recusa | 8.5 |
| 9 | Etiqueta `Só vinculado` no catálogo da Fase 6 | 4.2 |

### Critérios de aceite

1. Apagar um capítulo do aparelho o mantém na lista como "Só vinculado", com o último ponto intacto.
2. **Baixar de novo e continuar** abre na página onde o leitor parou.
3. Adicionar capítulos novos na pasta do Drive faz o **Verificar novos** destacá-los.
4. Um capítulo esquecido, com origem no Drive, pode ser vinculado de novo pelo número.
5. *Remover obra* numa obra com capítulos `cloud` apaga tudo e não altera o Drive.
6. Mesclar duas obras com origens diferentes nunca perde um vínculo sem aviso.

**Fase 8 pronta quando:** o ciclo "baixar, ler, apagar, voltar a baixar e continuar" funciona de ponta a ponta.

---

## Fase 9: Acabamento e endurecimento (Release 3)

**Objetivo:** tirar o que é opcional da frente do caminho crítico e fechar o pacote open-source.
**Depende de:** todas as anteriores.
**Por que por último:** tudo aqui melhora o produto, mas nada bloqueia o uso. Alguns itens (CSP imposta, limite de taxa) só podem ser ligados depois de testar todas as telas.

### Entregas

| # | Entrega | Seção |
|---|---|---|
| 1 | **2 downloads simultâneos** como opção avançada, com redução automática para 1 após 429 ou cota | 14.1, 5.6 |
| 2 | **Reinstalar arquivos do app** (avançado), com aviso de que precisa de internet | 9.2 |
| 3 | **CSP imposta** (de *Report-Only* para ativa), depois de testar todas as telas | 12.4 |
| 4 | **Limite de taxa por IP** no servidor, conforme a validação da seção 19.2 | 12.5 |
| 5 | Atalhos de limpeza em lote refinados e mensagens de erro revisadas | 4.5, 14.2 |
| 6 | `README.md` reescrito (o que fica no aparelho, o que passa pelo servidor, nota sobre conteúdo) | 15.6 |
| 7 | `HOSPEDAGEM.md` atualizado (modo A e a regra de `/api/`) | 15.6 |
| 8 | `SELF-HOST.md` revisado com o que foi aprendido na instalação por terceiros | 15.5 |
| 9 | Bateria completa de testes manuais no Android e instalação do zero **nos dois modos** | 18.2 |

### Critérios de aceite

1. Com 2 downloads ligados, um 429 reduz para 1 sozinho e a fila continua.
2. Com a CSP imposta, **nenhuma tela** perde função.
3. Tentativas repetidas de código errado são limitadas.
4. A instalação do zero, seguindo só o `SELF-HOST.md`, funciona no modo A **e** no modo B.
5. O README descreve com precisão o que o app guarda e o que o servidor enxerga.

### Marco: Release 3

Projeto completo, endurecido e pronto para ser publicado como open-source.

---

## 4. Dependências finas (item a item)

Quando um item de uma fase parece "poder ir antes", esta tabela mostra por que não pode.

| Item | Precisa de | Fase |
|---|---|---|
| Qualquer tela de espaço | `stats()` e regras de remoção | 1 → 3 |
| "Parou: cap. N" | Store `progress` e `lastRead` | 1 → 2 |
| Ordenação por número | `chapterNumber` | 1 → 2 |
| Ordenação por peso e "x/y capítulos" | `stats()` | 1 → 2 |
| Aba "Biblioteca" nos Ajustes | Chaves de ajuste e o gerenciador de espaço | 1, 3 |
| Conexão nos Ajustes | Aba "Biblioteca" e servidor | 3, 4 → 5 |
| `/api/` fora do cache | Existir um cliente que chame `/api/` | 5 |
| Catálogo | Conexão válida e analisador de links | 5 → 6 |
| "Próximos N" | `pickN` e o último capítulo baixado | 3, 6 |
| Download | Catálogo, `writeStream` e banco v2 | 1, 6 → 7 |
| "Só vinculado" na interface | Capítulos com `remote` (existem só após o download) | 7 → 8 |
| *Baixar de novo e continuar* | `cloud`, download e `lastRead` | 2, 7 → 8 |
| CSP imposta | Todas as telas prontas e testadas | tudo → 9 |
| Remover obra com tudo | `removeWork` completo e progresso por obra | 1 → 3 |

---

## 5. Portões de qualidade

Nenhuma release sai sem o portão da fase correspondente.

| Marco | Portão |
|---|---|
| Fim da Fase 0 | Testes rodando e decisões do modo A ou B e de `.assetsignore` ou `public/` registradas |
| Fim da Fase 1 | Migração testada duas vezes e com falha simulada; teste em perfil com biblioteca real v1 |
| **Release 1** | Fase 3 completa; testes manuais 4, 6, 7 e 8; `VERSAO` do `sw.js` aumentada |
| Fim da Fase 4 | `curl` e testes automáticos passando; servidor fechado por padrão |
| Fim da Fase 5 | Os três cenários de conexão corretos; `/api/` fora do cache |
| **Release 2** | Fase 7 completa; testes manuais 1, 2, 3, 5 e 9; instalação por outra pessoa via `SELF-HOST.md` |
| Fim da Fase 8 | Ciclo completo de baixar, apagar e baixar de novo com o último ponto intacto |
| **Release 3** | Fase 9 completa; CSP sem bloqueios; instalação do zero nos dois modos |

---

## 6. Regras de trabalho entre fases

1. **A cada publicação que mude qualquer arquivo do app, aumentar `VERSAO` no `sw.js`.** É isso que faz o aviso "Nova versão disponível" aparecer.
2. **Arquivo novo** (`remote.js`, `config.js`): linha no `_headers` e no `vercel.json`, e caminho em `ESSENCIAIS` no `sw.js`.
3. **Mudança de banco** só com migração idempotente e teste de falha.
4. **Nenhuma chave, código ou endereço no repositório.** Tudo em segredos do Worker e em Ajustes no aparelho.
5. **Toda ação que apaga dados** mostra quanto será liberado ou perdido e pede confirmação.
6. **Cada fase fecha com o app abrindo e funcionando.** Se algo ficar pela metade, fica atrás de uma condição (por exemplo, a opção de Drive só aparece com servidor presente).

---

## 7. Onde cada fase está no plano principal

| Fase | Seções de `PLANO-DRIVE-E-ARMAZENAMENTO.md` |
|---|---|
| 0 | 19.2 (itens a validar), 18.1, 21.2 |
| 1 | 3, 6, 7.4, 8.5, 9.3, 14.4 |
| 2 | 4.4, 5.1, 5.3, 7, 10.1, 10.2 |
| 3 | 4.5, 4.6, 5.4, 5.5, 5.6, 5.7, 8, 9, 10.3 |
| 4 | 11, 12, 13, 15.3 |
| 5 | 4.0, 5.6, 6.5, 13.3, 14.6, 15.4 |
| 6 | 4.1, 4.2, 5.2, 10.4 |
| 7 | 14, 15.5 |
| 8 | 3.2, 4.3, 4.4, 8.2, 8.3 |
| 9 | 9.2, 12.4, 12.5, 14.1, 15.6 |
