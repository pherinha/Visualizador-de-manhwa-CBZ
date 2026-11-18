# Lombada

Leitor de manhwas (e quaisquer HQs em arquivos `.cbz`/`.zip`) que funciona **totalmente offline**, **sem servidor** e **sem enviar nada para fora do aparelho**. Basta abrir os arquivos — a biblioteca cuida do resto.

---

## ✨ O que ele faz

- **Abre arquivos `.cbz` e `.zip`** contendo imagens de páginas (jpg, png, webp, gif, avif).
- **Guarda tudo no aparelho**: os arquivos vão para o **OPFS** (armazenamento privado do site) e, se o navegador não deixar, para o **IndexedDB**. Nenhum byte sai do seu dispositivo.
- **Organiza automaticamente** em *obras* e *capítulos* — pelo nome do arquivo (`Cap 12`, `Capítulo 12`, `Ch.12`, `Ep 3`, `#12`, `045`…) ou pela pasta em que o arquivo estava.
- **Capa automática**: se houver uma imagem `poster.jpg` (ou `.png`/`.webp`/`.avif`) na pasta, ela vira a capa da obra. Se não houver, o app recorta o topo da primeira página que você abrir.
- **Continua de onde parou**: guarda a página de cada capítulo (com a mesma chave “nome+tamanho” usada para detectar duplicados).
- **Rolagem automática** com velocidade ajustável e opção de seguir para o próximo capítulo ao terminar.
- **Modo foco / tela cheia**, barra de progresso, contador de páginas, brilho/quente ajustáveis.
- **Tema automático** (segue o sistema), claro, escuro ou personalizado com cor de destaque.
- **Instalável como app** (PWA) com service worker e aviso de atualização.
- **Tela acesa durante a leitura** (Wake Lock).
- **Leveza**: só extrai e decodifica as páginas próximas à tela; descarrega as distantes.

---

## 🧱 Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | Estrutura das telas (biblioteca → obra → leitor) e painéis. |
| `estilo.css` (ou equivalente) | Estilos, temas e animações. |
| `library.js` | Camada de armazenamento (OPFS + IndexedDB), importação, agrupamento, miniaturas. Expõe `window.Library`. |
| `script.js` | Interface, estado do leitor, ajustes, importação, rolagem automática, PWA. |
| `jszip.min.js` | Biblioteca JSZip (leitura de `.cbz`/`.zip`). |
| `sw.js` | Service worker (cache do app para funcionar offline). |
| `manifest.webmanifest` | Metadados da PWA (nome, ícones, cor de tema). |

A biblioteca local (`library.js`) expõe:

```js
window.Library = {
  init, usage, hasOPFS, norm, titleFromName, scan, group, importGroups, thumb,
  overview, listChapters, getFile, setPages, setCover,
  renameWork, moveChapter, removeChapter, removeWork,
};
```

---

## 🚀 Como usar

1. Hospede os arquivos estáticos em qualquer servidor **HTTPS** (ou `localhost`). PWA, OPFS e Wake Lock exigem contexto seguro.
2. Abra o app no navegador. Na primeira vez ele cria os bancos (`cbz-library`) e a pasta `cbz` no OPFS.
3. Toque em **Adicionar**:
   - **Escolher pasta** — melhor experiência: cada pasta vira uma obra e o `poster.*` da pasta vira a capa.
   - **Escolher arquivos** — os agrupamentos são inferidos pelo nome.
4. Confira o agrupamento na folha de importação (dá para renomear cada obra antes de importar).
5. Toque em **Importar**. Os arquivos são copiados para o aparelho.
6. Pronto: comece a ler pela biblioteca, pela obra ou por “Continuar lendo”.

> Instalar como app (Chrome Android: menu → *Instalar aplicativo*) ajuda o navegador a **não apagar** os dados por falta de espaço.

---

## 💾 Onde os dados ficam

- **Arquivos `.cbz`**: em `OPFS → /cbz/<id>.cbz`. Se o OPFS falhar (por exemplo, sem espaço para o temporário do Chrome), caem em **IndexedDB → `blobs`**.
- **Obras**: IndexedDB → `works` (`id`, `title`, `cover`, `coverFrom`, `added`).
- **Capítulos**: IndexedDB → `chapters` (`id`, `workId`, `name`, `size`, `sig`, `store`, `pages`, `added`). Índices: `workId` e `sig`.
- **Progresso de leitura**: `localStorage → cbz-reader:pos` (`{ "nome|tamanho": { p, t, d } }`).
- **Ajustes**: `localStorage → cbz-reader:v2`.

Como nada sai do aparelho, **não há conta, sincronização ou backup na nuvem** — e limpar os dados do site apaga a biblioteca. Instalar a PWA e manter espaço livre reduz muito o risco.

---

## ⚙️ Ajustes (aba Ajustes)

- **Tema**: automático, claro, escuro ou personalizado (cor de fundo + destaque, contraste corrigido automaticamente).
- **Interface**: tamanhos pequeno / médio / grande.
- **Leitura**: largura da coluna, espaçamento, cantos arredondados.
- **Conforto visual**: escurecimento e luz quente.
- **Rolagem automática**: velocidade.
- **Barra / contador / ocultar automaticamente** ao rolar.
- **Lembrar posição / próximo capítulo automático**.
- **Economia** (ligada sozinha em aparelhos modestos): menos páginas em memória por vez.
- **Manter tela acesa** durante a leitura.
- **Instalar app** (aparece quando o navegador oferece).

O botão **Restaurar** devolve todos os padrões.

---

## 🖼️ Formato dos nomes de arquivo

O app tira do nome prefixos de grupo, `[tags]`, `(parênteses)` e sufixos como `Cap 12`, `Capítulo 12`, `Ch.12`, `Ep 3`, `#12`, `045`, `v2`, `final`. Exemplos:

| Arquivo | Obra | Capítulo |
|---|---|---|
| `Solo Leveling/Cap 001.cbz` | Solo Leveling | Cap 001 |
| `[Scan] Tower of God - 045 (v2).cbz` | Tower of God | 045 |
| `Berserk_Vol 03.cbz` | Berserk | Vol 03 |

Se a mesma obra aparecer com nomes ligeiramente diferentes, use **Opções da obra → Salvar nome** para **unir** as duas (capítulos migram juntos).

---

## 🧑‍💻 Desenvolvimento

Não há build, bundler nem dependências para instalar — é HTML/CSS/JS puro.

- Sirva a pasta com qualquer servidor estático, por exemplo:
  ```bash
  npx serve .
  # ou
  python3 -m http.server 8080
  ```
- Edite `script.js` (interface) ou `library.js` (armazenamento).
- O app registra `sw.js`; **durante o desenvolvimento** use “Recarregar ignorando o cache” ou *Application → Service Workers → Unregister* no DevTools.
- Atualizações do SW são entregues pela faixa **“Atualizar”** no topo — nunca recarregam no meio de uma leitura.

### Detalhes úteis

- A importação é **streaming** (`file.stream().pipeTo(writable)`), sem carregar o `.cbz` inteiro em memória.
- Capas são geradas em **WebP** (`360px` de largura) via `createImageBitmap` + `OffscreenCanvas`, recortando 2:3 quando a origem é uma página longa.
- Só capítulos cujo `sig` (`nome|tamanho`) já existe na biblioteca são ignorados como duplicados.
- O leitor abre o `.cbz` com JSZip a cada capítulo; as páginas são extraídas sob demanda por `IntersectionObserver`.
- Se o navegador recusar a gravação por espaço (`QuotaExceededError`), a importação para e explica quota/uso estimados.

---

## 🌐 Compatibilidade

Testado com Chrome/Edge (Android e desktop) e Safari/Firefox mais recentes.

- **OPFS**: Chromium e Safari recentes.
- **IndexedDB**: em todos.
- **Wake Lock**: Chromium e Safari.
- **“Escolher pasta”** só aparece onde `webkitdirectory` existe.

Sem OPFS disponível, tudo continua funcionando — só cai automaticamente para o IndexedDB.

---

## 🔒 Privacidade

- Sem analytics, sem telemetria, sem chamadas de rede depois do primeiro carregamento.
- Nada é enviado a servidores: os arquivos e metadados vivem **apenas no seu aparelho**.
- O service worker serve apenas para o app abrir offline.

---

## 📄 Licença

O código deste repositório é livre para uso pessoal e educacional. O arquivo `jszip.min.js` é do projeto **JSZip v3.10.1** (© Stuart Knightley), duplamente licenciado sob MIT e GPLv3 — veja a licença original em <https://github.com/Stuk/jszip>.