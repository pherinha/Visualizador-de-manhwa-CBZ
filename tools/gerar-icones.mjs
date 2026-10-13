// Gera os ícones do app a partir do seu frog.svg.
//
// Uso (na raiz do projeto, uma única vez):
//   npm install --no-save sharp
//   node tools/gerar-icones.mjs frog.svg
//
// Opcional: cor do fundo como segundo argumento (padrão: menta #8bd3a3)
//   node tools/gerar-icones.mjs frog.svg "#121316"
//
// Observação: o sapo do projeto é escuro (o site o inverte no tema escuro),
// por isso o fundo padrão é claro. Se usar fundo escuro, o sapo precisa ser claro.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const origem = process.argv[2] || "frog.svg";
const fundo = process.argv[3] || "#8bd3a3";
await mkdir("icons", { recursive: true });

async function icone(tamanho, ocupa, saida) {
  const lado = Math.round(tamanho * ocupa);
  const figura = await sharp(origem, { density: 384 })
    .resize(lado, lado, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: tamanho, height: tamanho, channels: 4, background: fundo } })
    .composite([{ input: figura, gravity: "center" }])
    .png()
    .toFile(saida);
  console.log("ok", saida);
}

await icone(192, 0.7, "icons/icon-192.png");
await icone(512, 0.7, "icons/icon-512.png");
await icone(512, 0.5, "icons/icon-maskable-512.png"); // mais margem: o Android pode recortar em círculo
