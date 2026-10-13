# Hospedagem e regras de cache

O leitor é um site estático (sem build). Funciona em **Cloudflare Pages**, **Netlify** e **Vercel**. O que muda de uma plataforma para outra é só o arquivo de regras de cache.

| Plataforma | Arquivo de regras | Onde fica |
|---|---|---|
| Cloudflare Pages | `_headers` | raiz do projeto |
| Netlify | `_headers` (o mesmo arquivo) | raiz do projeto |
| Vercel | `vercel.json` | raiz do projeto |

Pode deixar os dois arquivos no projeto. Cada plataforma ignora o que não é dela.

---

## A regra, em uma tabela

| Arquivo | Cache-Control | Por quê |
|---|---|---|
| `/`, `index.html` | `no-cache` | A página precisa refletir a versão publicada. |
| `sw.js` | `no-cache` | Se ficar preso em cache, as atualizações do app demoram a chegar. |
| `manifest.webmanifest` | `no-cache` (e `Content-Type: application/manifest+json`) | Mudanças de nome, cor e ícone valem logo. |
| `assets/styles/*`, `script.js`, `library.js` | `no-cache` | Os nomes não têm hash. Veja a explicação abaixo. |
| `assets/js/vendor/*` (JSZip) | `public, max-age=31536000, immutable` | Nunca muda. Cache de 1 ano. |
| `icons/*`, `frog.svg`, `grain.gif`, `favicon.ico` | `public, max-age=86400` | 1 dia, para o caso de você trocar a imagem. |

`no-cache` não quer dizer "não guardar". Quer dizer "guardar, mas perguntar ao servidor se mudou antes de usar". Se não mudou, a resposta é um 304 minúsculo e o arquivo vem do próprio aparelho.

### Por que não usar cache longo nos arquivos do app?

Porque `style.css` e `script.js` não têm hash no nome. Com cache longo, duas coisas dão errado:

1. Quem já abriu o site fica com o arquivo velho até o prazo vencer.
2. O service worker (`sw.js`) instala a versão nova baixando os arquivos pelo cache do navegador. Se o navegador entregar a cópia velha, o app "atualiza" para a mesma versão de antes.

Com `no-cache`, o navegador revalida na hora e o service worker sempre instala os arquivos atuais.

---

## Como publicar em cada plataforma

Em todas, o site é a pasta raiz do projeto, **sem comando de build**.

**Cloudflare Pages:** conecte o repositório do GitHub, deixe o comando de build vazio e publique a raiz. O `_headers` é lido automaticamente.

**Netlify:** conecte o repositório, deixe o comando de build vazio e use a raiz como *publish directory*. O `_headers` precisa estar nessa pasta publicada.

**Vercel:** importe o repositório, escolha *Other* como framework e deixe build e output em branco. O `vercel.json` é lido automaticamente.

As três servem o site em HTTPS, que é exigido pelo service worker e pela instalação do app.

---

## Como conferir se as regras valeram

No PowerShell, use `curl.exe` (com o `.exe`; sem ele o PowerShell chama outro comando):

```powershell
curl.exe -sI https://SEU-SITE/sw.js | findstr /i cache-control
curl.exe -sI https://SEU-SITE/assets/js/script.js | findstr /i cache-control
curl.exe -sI https://SEU-SITE/assets/js/vendor/jszip.min.js | findstr /i cache-control
curl.exe -sI https://SEU-SITE/manifest.webmanifest | findstr /i "cache-control content-type"
```

Resultado esperado:

- `sw.js` e `script.js`: `no-cache`
- `jszip.min.js`: `public, max-age=31536000, immutable`
- manifest: `no-cache` e `application/manifest+json`

No Chrome do Android, conecte o aparelho ao computador e use `chrome://inspect`, ou abra o DevTools no desktop. Em **Application → Service Workers** dá para ver a versão ativa e se há uma esperando.

---

## Cuidados

1. **A cada publicação que mudar qualquer arquivo do app, aumente `VERSAO` no topo do `sw.js`.** É isso que faz o aviso "Nova versão disponível" aparecer para quem já instalou.
2. **Arquivo novo?** Se criar outro `.js` ou `.css`, adicione uma linha para ele no `_headers` e no `vercel.json`, e inclua o caminho em `ESSENCIAIS` no `sw.js`.
3. **Atualizar o JSZip:** como ele tem cache de 1 ano, troque o nome do arquivo (por exemplo `jszip-3.11.0.min.js`) e atualize o `index.html` e o `sw.js`.
4. **Trocar de plataforma:** quem instalou o app pelo endereço antigo precisa instalar de novo pelo endereço novo, porque o app é preso ao domínio. A biblioteca salva no aparelho também é separada por domínio, então os capítulos teriam que ser importados de novo.
5. **Subpasta:** estas regras assumem que o site fica na raiz do domínio (`https://seu-site/`). Se hospedar numa subpasta, ajuste os caminhos das regras.
