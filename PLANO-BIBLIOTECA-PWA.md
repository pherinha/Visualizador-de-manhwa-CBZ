# Plano de implementação: Biblioteca local + PWA

Projeto: Visualizador de Manhwa CBZ
Escopo: guardar os CBZ no próprio aparelho, mostrar uma lista de obras e capítulos ao abrir, e instalar o leitor como app que funciona sem internet.
Hospedagem: Cloudflare Pages (site estático, sem servidor próprio).

> **Atualização de escopo: por enquanto, só Android (Chrome).** Isso simplifica o plano:
> - A seção 9 (limite de 7 dias do Safari) e as meta tags do iPhone (seção 8.2) ficam **adiadas** até existir suporte a iPhone.
> - O OPFS com `createWritable` funciona no Chrome do Android, então a reserva em IndexedDB vira apenas segurança extra, não prioridade.
> - A instalação usa o evento `beforeinstallprompt` do Chrome (botão "Instalar" nos ajustes), sem a dica manual de "Adicionar à Tela de Início".
> - **Fase 1 (PWA) já implementada**: `manifest.webmanifest`, `sw.js`, `_headers`, ícones, aviso de atualização e botão de instalar.
> - **Fases 2 e 3 (biblioteca) já implementadas**: `assets/js/library.js` (armazenamento, agrupamento, importação) e telas de biblioteca, obra e importação no `script.js`.
> - **Decisões tomadas:** o agrupamento por obra usa **os dois métodos, com escolha na tela de importação** (por pasta ou pelo nome do arquivo, com o nome da obra editável). Uma imagem chamada **`poster`** na pasta vira a **capa da obra**.

---

## 1. Objetivo

Hoje, toda vez que o site abre, é preciso escolher os arquivos de novo. Depois desta implementação:

1. O leitor **importa os CBZ uma única vez** e passa a lembrá-los.
2. Ao abrir, aparece uma **biblioteca** com as obras, os capítulos, o progresso de leitura e um botão "Continuar".
3. O leitor pode ser **instalado como app** (ícone na tela inicial), abre rápido e funciona **sem internet**.
4. O núcleo de carregamento de imagens (observers, fila, `load`, `unload`, `anchored`) **não muda**.

### Fora do escopo (por enquanto)

- Sincronização entre aparelhos (exigiria nuvem; ver conversa anterior sobre R2).
- Conta de usuário ou login.
- Leitura de formatos além de CBZ/ZIP.

---

## 2. Decisões de arquitetura

### 2.1 Onde guardar os arquivos

| Camada | Uso | Observações |
|---|---|---|
| **OPFS** (Origin Private File System) | Guarda os arquivos `.cbz` | Armazenamento privado do site, sujeito à cota do navegador. Limpar os dados do site apaga tudo. |
| **IndexedDB** | Guarda os metadados (obras, capítulos) e, se o OPFS não puder gravar, os próprios arquivos como `Blob` | Banco nativo de todos os navegadores. |
| **localStorage** | Continua guardando os ajustes e o progresso de leitura | Já existe, não muda. |

**Regra de escolha (detecção em tempo de execução):**

```text
se FileSystemFileHandle.prototype.createWritable existe → OPFS
senão                                                    → IndexedDB (Blob)
```

Motivo: o suporte do OPFS varia. O Safari historicamente só permitia gravar via `createSyncAccessHandle`, que exige um Web Worker. Segundo o registro do WebKit, o Safari 26 passou a suportar o `createWritable` (a fonte está na seção 12). Em vez de depender da versão, o código testa se a função existe e cai para o IndexedDB quando não existe. Assim funciona em qualquer navegador sem Worker.

### 2.2 Metadados preguiçosos (importante para celular fraco)

Ao importar, **não abrir o ZIP**. A importação só copia o arquivo (em streaming, sem carregar na memória). O número de páginas e a capa são descobertos **na primeira vez que o capítulo for aberto**, quando o ZIP já precisa ser lido de qualquer forma.

Vantagem: importar 50 capítulos não trava o aparelho nem estoura a memória.

### 2.3 Identidade de cada capítulo

```text
sig = nome_do_arquivo + "|" + tamanho
```

É a mesma chave que o `script.js` já usa para guardar o progresso (`fkey`). Quem já tem progresso salvo **não perde nada** ao migrar. O mesmo `sig` serve para detectar duplicatas na importação.

O `id` interno é um `crypto.randomUUID()`, usado no nome do arquivo dentro do OPFS (`cbz/<id>.cbz`).

---

## 3. Modelo de dados

Banco IndexedDB: `cbz-library`, versão 1.

### 3.1 Store `works` (obras)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (chave) | UUID |
| `title` | string | Nome exibido |
| `cover` | Blob \| null | Miniatura da primeira página (gerada na primeira leitura) |
| `added` | number | Data de criação (timestamp) |

### 3.2 Store `chapters` (capítulos)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (chave) | UUID |
| `workId` | string (índice) | Obra a que pertence |
| `name` | string | Nome do capítulo (nome do arquivo sem a extensão) |
| `size` | number | Tamanho em bytes |
| `sig` | string (índice único) | `nome\|tamanho`; evita duplicatas e liga ao progresso |
| `store` | `"opfs"` \| `"idb"` | Onde o arquivo está guardado |
| `pages` | number \| null | Preenchido na primeira abertura |
| `added` | number | Timestamp |

### 3.3 Store `blobs` (só no modo de reserva)

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string (chave) | Igual ao `id` do capítulo |
| `blob` | Blob | O CBZ inteiro |

### 3.4 Ordem dos capítulos

Não é guardada. Calcula-se na hora com o mesmo `Intl.Collator` com ordenação numérica que o leitor já usa (`Cap 2` vem antes de `Cap 10`).

---

## 4. Estrutura de arquivos

### 4.1 Arquivos novos

```text
Visualizador-de-manhwa-CBZ/
├── sw.js                         ← service worker (precisa ficar na RAIZ para cobrir o site todo)
├── manifest.webmanifest          ← dados do app instalável
├── _headers                      ← regras de cache da Cloudflare Pages
├── icons/
│   ├── icon-192.png              ← gerado a partir do frog.svg
│   ├── icon-512.png
│   ├── icon-maskable-512.png     ← versão com margem de segurança
│   └── apple-touch-icon.png      ← 180×180, usado pelo iPhone
└── assets/
    └── js/
        ├── library.js            ← camada de armazenamento (OPFS/IndexedDB)
        └── script.js             ← alterado (ver seção 7)
```

### 4.2 Arquivos alterados

| Arquivo | O que muda |
|---|---|
| `index.html` | Links do manifest e dos ícones, meta tags do iPhone, tela da biblioteca, folha de importação, carregamento do `library.js` |
| `assets/styles/style.css` | Estilos da biblioteca (grade de obras, lista de capítulos, barra de uso) |
| `assets/js/script.js` | `setFiles` e `openChapter` passam a usar a biblioteca; novos botões; registro do service worker |

### 4.3 O que **não** muda

`observe`, `pump`, `load`, `unload`, `anchored`, `reset`, rolagem automática, ajustes e temas.

---

## 5. Fluxo do usuário

### 5.1 Primeira vez

```text
Abre o site → Biblioteca vazia
   └─ [Adicionar capítulos]  (ou arrastar arquivos / escolher uma pasta)
        └─ Folha de importação: mostra "Obra X: 12 capítulos"  (editável)
             └─ [Importar] → barra de progresso, um arquivo por vez
                  └─ Biblioteca com a obra → toque → capítulos → leitura
```

### 5.2 Uso diário

```text
Abre o app → Biblioteca já pronta
   └─ Cartão "Continuar: Obra X · Cap 5 · pág 12"  → leitura retoma na página
```

### 5.3 Gerenciar

- Remover um capítulo ou uma obra inteira (com confirmação).
- Renomear uma obra.
- Mover um capítulo para outra obra (caso o agrupamento automático erre).
- Ver quanto espaço está sendo usado.

---

## 6. Camada de armazenamento (`library.js`)

### 6.1 API proposta

```js
const lib = {
  init(),                          // abre o IndexedDB, detecta OPFS, pede persistência
  importFiles(files, { workId, onProgress, signal }),
  listWorks(),                     // obras + contagem de capítulos
  listChapters(workId),            // capítulos ordenados
  getFile(chapterId),              // devolve um File/Blob para o JSZip
  setPages(chapterId, n),          // grava a contagem na primeira abertura
  setCover(workId, blob),
  renameWork(workId, title),
  moveChapter(chapterId, workId),
  removeChapter(chapterId),
  removeWork(workId),
  usage(),                         // { used, quota, persisted }
};
```

### 6.2 Importação (por arquivo, em sequência)

1. Ignorar se a extensão não for `.cbz` ou `.zip`.
2. Calcular `sig`. Se já existir, pular e avisar ("já estava na biblioteca").
3. Conferir a cota livre com `navigator.storage.estimate()`; avisar se `livre < tamanho × 1,1`.
4. Copiar o arquivo **em streaming**:
   - OPFS: `file.stream().pipeTo(await handle.createWritable())`
   - Reserva: gravar o `Blob` no store `blobs`
5. Criar o registro em `chapters`.
6. Tratar `QuotaExceededError`: parar, avisar e **apagar o arquivo pela metade**.

Um arquivo por vez evita picos de memória em aparelhos simples.

### 6.3 Leitura

`getFile(id)`:
- OPFS: `(await handle.getFile())`, que devolve um `File` sem copiar tudo para a memória.
- Reserva: o `Blob` do IndexedDB.

O resultado entra direto em `JSZip.loadAsync(...)`, como hoje.

### 6.4 Agrupamento automático por obra

Heurística aplicada ao nome do arquivo (sem extensão):

```text
"Solo Leveling - Cap 12"  → obra "Solo Leveling"
"Tower of God 045"        → obra "Tower of God"
"One Shot"                → obra "One Shot"  (sem número: usa o nome todo)
```

Expressão base (ajustável): remove do final `cap`, `capítulo`, `ch`, `chapter`, `ep`, `#` seguidos de número, e separadores (`-`, `_`, `.`, espaços).

**Implementado:** na folha de importação há um seletor "Agrupar obras por: Pasta | Nome do arquivo". "Pasta" só fica ativo quando o aparelho informa as pastas (veja a nota abaixo). Cada obra tem o nome editável e mostra a etiqueta "Já existe na biblioteca" quando o nome coincide com uma obra salva (nesse caso os capítulos entram nela). Na folha de importação o leitor **vê e edita** o agrupamento antes de confirmar. Importar uma **pasta** (`<input webkitdirectory>` ou arrastar pasta) usa o nome da pasta como obra, sem heurística.

### 6.4.1 Poster (capa da obra)

- O arquivo precisa se chamar exatamente `poster` (qualquer extensão de imagem; maiúsculas não importam), por exemplo `poster.jpg`.
- Ele vale para a obra que mora **na mesma pasta**. Funciona tanto no modo "Pasta" quanto no modo "Nome do arquivo".
- Na seleção solta de arquivos (sem pastas), o poster só é usado se a seleção tiver **uma única obra**. Com várias obras ele é ambíguo e é ignorado, com aviso na tela.
- O poster é reduzido para cerca de 360 px e salvo como WebP. Ele **tem prioridade** sobre a capa automática.
- Sem poster, a obra ganha uma capa automática: o topo da primeira página do primeiro capítulo aberto, gerada depois, sem atrapalhar a leitura.

> **Nota sobre escolher pasta no Android:** segundo a documentação do MDN, o seletor de pasta (`webkitdirectory`) só funciona no Chrome do Android a partir da versão **132**. Em versões anteriores o aparelho devolve os arquivos sem o caminho da pasta; o leitor detecta isso, desativa a opção "Pasta" e agrupa pelo nome.

### 6.5 Persistência e cota

Na inicialização:

```js
if (navigator.storage?.persist) await navigator.storage.persist();
```

- Pede ao navegador para **não apagar** os dados do site quando faltar espaço.
- O resultado vira um aviso na tela de armazenamento ("Protegido" ou "Pode ser apagado pelo sistema").

---

## 7. Integração com o `script.js`

### 7.1 Mudança conceitual

Hoje `st.files` é uma lista de objetos `File`. Passa a ser uma lista de **capítulos da biblioteca** (`{ id, name, sig, ... }`) e o arquivo é obtido só no momento de abrir.

### 7.2 Pontos de alteração

| Função | Hoje | Depois |
|---|---|---|
| `setFiles(list)` | Recebe `File[]`, ordena, abre o primeiro | Vira o **ponto de importação**: manda para `lib.importFiles` e atualiza a biblioteca |
| `openChapter(i, p)` | `JSZip.loadAsync(st.files[i])` | `const file = await lib.getFile(st.files[i].id); JSZip.loadAsync(file)`; depois grava `pages` e gera a capa se faltar |
| `fkey(f)` | `f.name + "|" + f.size` | `ch.sig` (mesmo valor, o progresso antigo continua válido) |
| Seletor de capítulos (topo) | Lista todos os arquivos escolhidos | Lista os capítulos **da obra aberta** |
| Estado inicial | Tela de boas-vindas | Biblioteca (ou boas-vindas, se estiver vazia) |

### 7.3 Novas peças de interface

- **Biblioteca:** grade de obras com capa, título e contagem; cartão "Continuar".
- **Detalhe da obra:** lista de capítulos com marcação de lido e página atual.
- **Folha de importação:** pré-visualização do agrupamento + barra de progresso.
- **Armazenamento:** uso/cota, estado de proteção, remoção em massa.
- **Botão "Biblioteca"** na barra superior (volta da leitura para a lista).

### 7.4 Wireframes

```text
┌─────────────────────────────┐   ┌─────────────────────────────┐
│ [+]  Biblioteca        [⚙]  │   │ ‹  Solo Leveling       [⋯]  │
├─────────────────────────────┤   ├─────────────────────────────┤
│ ┌─────────────────────────┐ │   │ Continuar: Cap 5 · pág 12   │
│ │ Continuar               │ │   │ [ Continuar leitura ]       │
│ │ Solo Leveling · Cap 5   │ │   ├─────────────────────────────┤
│ └─────────────────────────┘ │   │ Cap 1   ✓ lido             │
│ ┌──────┐ ┌──────┐ ┌──────┐ │   │ Cap 2   ✓ lido             │
│ │ capa │ │ capa │ │ capa │ │   │ Cap 3   ✓ lido             │
│ │      │ │      │ │      │ │   │ Cap 4   ✓ lido             │
│ └──────┘ └──────┘ └──────┘ │   │ Cap 5   ▸ pág 12 / 48      │
│  Obra A   Obra B   Obra C   │   │ Cap 6                      │
│  12 cap.  8 cap.   3 cap.   │   │ ...                        │
└─────────────────────────────┘   └─────────────────────────────┘
```

### 7.5 Capa

Gerada **na primeira abertura** de qualquer capítulo da obra:

1. Extrair a primeira imagem do ZIP já aberto.
2. Reduzir para cerca de 240 px de largura com `createImageBitmap` + canvas.
3. Salvar como WebP no campo `cover`.

Enquanto não existir, a obra mostra um espaço reservado com a inicial do título.

### 7.6 Atenção: memória do JSZip

O JSZip lê o arquivo **inteiro para a memória** ao abri-lo. Isso já acontece hoje e continua igual. Em CBZ muito grandes, aparelhos simples podem sofrer. Esta implementação não piora isso, mas fica registrado como ponto a medir (ver Fase 3).

---

## 8. PWA

### 8.1 Manifest (`manifest.webmanifest`)

```json
{
  "name": "Visualizador de Manhwa",
  "short_name": "Manhwa",
  "description": "Leia manhwas em CBZ direto do navegador.",
  "lang": "pt-BR",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#121316",
  "theme_color": "#121316",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Usar caminhos relativos (`./`) mantém o app funcionando mesmo se for publicado em uma subpasta.

### 8.2 Alterações no `<head>` do `index.html`

```html
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Manhwa">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

Com `viewport-fit=cover` (já presente) e as `env(safe-area-inset-*)` do CSS, o layout já respeita o entalhe do iPhone.

### 8.3 Service worker (`sw.js`)

**Papel:** guardar a "casca" do app para abrir offline. **Não** guarda capítulos (eles ficam no OPFS/IndexedDB).

**Estratégia:**

| Tipo de requisição | Estratégia |
|---|---|
| Navegação (`index.html`) | Rede primeiro, cache como reserva (assim o app atualiza quando há internet) |
| CSS, JS, SVG, ícones, JSZip | Cache primeiro, com a versão do cache no nome |
| Qualquer outra | Ignorar (passa direto para a rede) |

**Esqueleto:**

```js
const V = "manhwa-v1";               // trocar a cada publicação
const SHELL = [
  "./", "index.html", "manifest.webmanifest",
  "assets/styles/style.css",
  "assets/js/script.js", "assets/js/library.js",
  "assets/js/vendor/jszip.min.js",
  "frog.svg", "grain.gif", "favicon.ico",
  "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const r = e.request;
  if (r.method !== "GET" || new URL(r.url).origin !== location.origin) return;
  if (r.mode === "navigate") {
    e.respondWith(fetch(r).catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(r).then((hit) => hit || fetch(r)));
});
```

### 8.4 Atualização do app

Como os arquivos não têm hash no nome, a versão do cache (`V`) precisa mudar a cada publicação. Fluxo:

1. Novo `sw.js` é detectado → instala em segundo plano.
2. O leitor mostra um aviso: **"Nova versão disponível. Atualizar"**.
3. Ao tocar, o service worker novo assume e a página recarrega.

Nunca recarregar sozinho durante a leitura.

### 8.5 Instalação

| Plataforma | Como instalar | Ação do leitor |
|---|---|---|
| Chrome / Edge (Android e desktop) | Evento `beforeinstallprompt` | Botão "Instalar app" nos ajustes |
| iPhone / iPad (Safari) | Sem evento; é manual | Dica: "Compartilhar → Adicionar à Tela de Início" |
| Firefox Android | Menu do navegador | Dica no mesmo cartão |

O cartão de instalação aparece **uma vez** e some se for dispensado ou se o app já estiver instalado (`matchMedia("(display-mode: standalone)")`).

### 8.6 Cloudflare Pages (`_headers`)

```text
/sw.js
  Cache-Control: no-cache

/manifest.webmanifest
  Cache-Control: no-cache
  Content-Type: application/manifest+json
```

O `sw.js` nunca deve ficar preso em cache longo, senão as atualizações demoram a chegar.

### 8.7 Opcional: abrir `.cbz` direto pelo app (desktop Chromium)

O manifest aceita `file_handlers`, que permite "Abrir com Visualizador de Manhwa" no sistema. Fica para a Fase 3.

---

## 9. Persistência e o caso do iPhone

Fatos relevantes (fontes na seção 12):

- No Safari, dados gravados por script (IndexedDB, localStorage, registros de service worker) podem ser apagados depois de **7 dias de uso do Safari sem visitar o site**.
- Apps adicionados à **tela inicial** não fazem parte do Safari e têm contador próprio de dias de uso, que acompanha o uso real do app.
- A API `navigator.storage.persist()` existe no WebKit e é concedida com base em heurísticas, como o site estar aberto como app da tela inicial.

### 9.1 O que o projeto faz

1. Pede `persist()` ao iniciar.
2. Mostra o estado ("Protegido" ou "Pode ser apagado pelo sistema") na tela de armazenamento.
3. No iPhone, **sugere instalar o app** quando o armazenamento não estiver protegido.
4. Oferece **exportar** um capítulo ou obra de volta para arquivo, como cópia de segurança.
5. Deixa claro na interface que a biblioteca é uma **cópia local**: os originais devem ser mantidos fora do navegador.

---

## 10. Plano em fases

### Fase 1: PWA mínimo (entrega pequena, ganho imediato)

- Manifest, ícones, meta tags do iPhone.
- Service worker com cache da casca.
- Aviso de atualização.
- Cartão de instalação.

**Aceite:** instalar no Android e no iPhone; abrir em modo avião e ver a tela de boas-vindas; publicar uma versão nova e receber o aviso de atualização.

### Fase 2: Biblioteca mínima

- `library.js` com IndexedDB + OPFS + reserva.
- Importar arquivos, listar obras/capítulos, abrir capítulo da biblioteca.
- Progresso continua funcionando com a mesma chave.

**Aceite:** importar 5 capítulos, fechar o navegador, reabrir e ler sem escolher arquivos de novo; duplicata é detectada; cota cheia mostra mensagem clara.

### Fase 3: Biblioteca completa

- Agrupamento automático com edição.
- Capas geradas na primeira abertura.
- Cartão "Continuar", marcação de lido, remover/renomear/mover.
- Tela de armazenamento com uso, cota e proteção.
- Exportar capítulo/obra.
- Importar pasta.

**Aceite:** biblioteca com 3 obras e mais de 30 capítulos navegável sem travar em um celular simples.

### Fase 4: Otimizações opcionais

- Medir memória com CBZ grande e, se necessário, trocar o JSZip por zip.js com `BlobReader` (lê por partes).
- `file_handlers` no desktop.
- Aviso entre abas (`BroadcastChannel`) quando a biblioteca muda.

---

## 11. Testes e riscos

### 11.1 Matriz de testes

| Cenário | Chrome Android | Safari iPhone | Firefox | Chrome desktop |
|---|:-:|:-:|:-:|:-:|
| Importar e reabrir | ☐ | ☐ | ☐ | ☐ |
| Instalar como app | ☐ | ☐ | ☐ | ☐ |
| Abrir offline | ☐ | ☐ | ☐ | ☐ |
| Reserva em IndexedDB (forçar sem OPFS) | ☐ | ☐ | ☐ | ☐ |
| Atualização do service worker | ☐ | ☐ | ☐ | ☐ |

### 11.2 Cenários específicos

- Importar o mesmo arquivo duas vezes (duplicata).
- Importar com pouco espaço livre (cota).
- Remover o capítulo que está aberto.
- Duas abas abertas ao mesmo tempo.
- Importar 50 capítulos de uma vez em um aparelho com pouca memória.
- Abrir um capítulo importado antes da migração e ver se o progresso antigo continua.

### 11.3 Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| OPFS sem `createWritable` no navegador | Não grava | Detecção em tempo de execução e reserva em IndexedDB |
| Dados apagados pelo sistema (Safari) | Perda da biblioteca | `persist()`, instalação como app, exportação, aviso claro |
| Cota insuficiente | Importação falha | Conferir cota antes, tratar `QuotaExceededError`, apagar arquivo parcial |
| JSZip carrega o arquivo inteiro na memória | Travamento em CBZ enormes | Medir na Fase 4; opção de trocar por zip.js |
| Service worker preso em versão antiga | Usuário não recebe correções | `no-cache` no `sw.js`, versão no cache, aviso de atualização |
| Agrupamento automático errado | Obras bagunçadas | Pré-visualização editável e opção de mover capítulos |

---

## 12. Fontes consultadas

- WebKit, política de armazenamento (cota, `persist()` e apps da tela inicial): https://webkit.org/updates
- WebKit Bugzilla 231706, discussão do File System e a nota de que o Safari 26 adicionou o File System WritableStream: https://bugs.webkit.org/show_bug.cgi?id=231706
- Limite de 7 dias do Safari para armazenamento gravado por script e exceção dos apps da tela inicial: https://mjtsai.com/blog/2020/03/26/safari-13-1-third-party-cookie-blocking-and-7-day-script-writeable-storage/

> Política de armazenamento e suporte de API mudam entre versões dos navegadores. Antes de implementar, vale reconferir essas fontes e testar em aparelhos reais.

---

## 13. Decisões em aberto

1. ~~**Agrupamento**~~ → definido: **os dois, com escolha na importação**, e `poster` na pasta vira a capa.
2. **Exportar:** a cópia de segurança deve ser por capítulo, por obra, ou ambos?
3. **Ordem de entrega:** começar pelo PWA (Fase 1, mais rápido) ou direto pela biblioteca (Fase 2)?
4. ~~**Aparelhos de teste**~~ → definido: **Android** por enquanto (confirmar o modelo e se é o Chrome).
