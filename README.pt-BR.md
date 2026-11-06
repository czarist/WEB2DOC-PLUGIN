<h1 align="center">Web2Doc</h1>

<h3 align="center">Salve páginas, partes de páginas e tabelas em PDF, imagem, Markdown, JSON, Word, Excel e CSV.</h3>

<p align="center">
  <a href="README.md">English</a> · <a href="README.pt-BR.md">Português (Brasil)</a>
</p>

<p align="center">
  <b>Uma extensão de navegador Manifest V3 que exporta o que você vê em uma página, inteiramente no seu dispositivo.</b>
</p>

<p align="center">
  <a href="https://github.com/czarist/WEB2DOC-PLUGIN/releases/tag/v1.1.2"><img alt="Versão 1.1.2" src="https://img.shields.io/badge/vers%C3%A3o-1.1.2-111111?style=flat-square"></a>
  <img alt="Node.js 26 LTS" src="https://img.shields.io/badge/Node.js-26_LTS-339933?style=flat-square&logo=nodedotjs&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-7.0-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Extens%C3%A3o%20de%20navegador-Manifest%20V3-4285F4?style=flat-square">
  <img alt="Webpack" src="https://img.shields.io/badge/bundle%20com-Webpack-8DD6F9?style=flat-square&logo=webpack&logoColor=black">
  <a href="LICENSE"><img alt="Licença: MIT" src="https://img.shields.io/badge/licen%C3%A7a-MIT-green?style=flat-square"></a>
  <a href="https://github.com/czarist/WEB2DOC-PLUGIN/actions/workflows/check.yml"><img alt="CI: testes e build" src="https://img.shields.io/github/actions/workflow/status/czarist/WEB2DOC-PLUGIN/check.yml?branch=dev&amp;label=build&amp;style=flat-square&amp;logo=githubactions&amp;logoColor=white"></a>
</p>

<p align="center">
  <a href="#recursos">Recursos</a> ·
  <a href="#começo-rápido">Começo rápido</a> ·
  <a href="#como-funciona">Como funciona</a> ·
  <a href="#desenvolvimento">Desenvolvimento</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

## Recursos

Tudo roda no seu navegador. Páginas, arquivos e imagens nunca são enviados a um servidor. A interface da extensão está em inglês; os nomes dos botões aparecem abaixo como na tela.

### Salvar uma página ou parte dela

- **Página inteira em PDF.** Captura a página como aparece na tela, com estilos, fundos, imagens e links clicáveis, em um PDF A4 com sumário gerado a partir dos títulos. Imagens adiadas (lazy) são carregadas antes, e cabeçalhos fixos são soltos para não se repetirem em todas as páginas. Opcionalmente adiciona o título e o endereço da página no topo de cada folha, a data e os números de página no rodapé e um QR Code que leva à página.
- **Parte da página.** Escolha **Save part of the page** e clique na seção desejada, ou mova o contorno com as setas do teclado e pressione Enter. Também é possível escolher elementos dentro de shadow roots abertos e frames inteiros. **Select larger area** amplia a seleção, **Choose again** recomeça e **Use main content** seleciona a área principal da página.
- **Editar antes de salvar.** Dentro da seleção, escolha uma ferramenta e clique:
  - **Exclude** deixa uma parte de fora; clique de novo para trazê-la de volta.
  - **Highlight** marca uma parte em amarelo.
  - **Arrow** aponta uma seta para uma parte.
  - **Comment** adiciona uma nota abaixo de uma parte.
  - **Redact** tarja uma parte de preto. O texto, os endereços de links e as descrições de imagens são removidos do arquivo salvo, não apenas cobertos.
  - **Page break** começa uma nova página do PDF antes de uma parte.
  - **Move** reordena os blocos da seleção.

  **Undo** e **Restore all** desfazem as alterações. Ajuste o título e o nome do arquivo; **Review** mostra a página apenas com o que será salvo. Salve como **PDF**, **imagem (PNG)**, **Markdown**, **JSON**, **Word (DOCX)**, abra no **reconhecimento de texto (OCR)** ou copie como Markdown. Pressione Esc a qualquer momento para cancelar: o Esc primeiro fecha um comentário ou movimento em aberto e depois as ferramentas. A página é restaurada ao salvar, voltar, cancelar ou quando a exportação falha.
- **Uma área da página.** **Save an area** permite arrastar um retângulo e salvá-lo como PNG, como PDF dessa imagem ou como texto reconhecido.

### Documentos e dados

- **Conteúdo principal em Markdown, JSON ou Word.** Títulos, parágrafos, listas, tabelas, links, imagens e blocos de código são mantidos; navegação, banners, barras laterais, formulários e rodapés ficam de fora. O Markdown começa com título, endereço e data de captura e pode ser copiado para a área de transferência. O JSON segue o esquema versionado em [`schemas/web2doc-document-v1.schema.json`](schemas/web2doc-document-v1.schema.json). Os documentos Word usam títulos reais, listas numeradas e com marcadores, tabelas, hyperlinks e imagens incorporadas, e começam com o endereço de origem e a data de captura.
- **Tabelas em Excel ou CSV.** O popup lista as tabelas da página com títulos, tamanhos e prévias, e contorna cada uma na página com o mesmo número. As planilhas Excel têm uma aba por tabela, com nomes válidos e únicos, cabeçalho congelado e filtros. Identificadores com zeros à esquerda continuam como texto, e o texto da página é sempre gravado como texto, mesmo quando começa com `=`, `+`, `-` ou `@`. Números, datas, porcentagens e moedas são convertidos quando o idioma da página os torna inequívocos (por exemplo `1.234,56` em uma página em português); o que for ambíguo fica como está escrito. Os arquivos CSV são UTF-8 com marca de ordem de bytes (BOM).
- **Links e metadados.** Uma planilha Excel com todos os links (texto, endereço, interno ou externo) e os metadados da página: título, endereço canônico, idioma, descrição, tags Open Graph e Twitter, títulos e contagem de palavras.

### Ferramentas

- **Arquivo offline.** Salva a página com imagens, estilos e fontes em um único arquivo MHTML que abre sem conexão.
- **Imagens da página.** Baixa as imagens exibidas pela página em um ZIP, com a lista de onde cada uma veio.
- **Texto da tela.** Reconhece o texto da parte visível da página. O reconhecimento roda no dispositivo, com dados de idioma em inglês e português que acompanham a extensão.
- **Comparar capturas.** Guarda o texto do conteúdo principal; na próxima vez que você usar na mesma página, mostra as linhas adicionadas e removidas.
- **QR Code da página.** Mostra um QR Code da página e permite baixá-lo em SVG.

### Presets, atalhos e lotes

- **Presets** guardam o que exportar e em qual formato. Já incluídos: **Clean article (PDF)**, **Tables only (Excel)**, **Technical documentation (Markdown)**, **Full page (PDF)** e **Offline archive (MHTML)**. Crie os seus nas configurações. Rode um preset pelo popup, pelo menu do botão direito, por atalho de teclado ou em uma exportação em lote.
- **Atalhos de teclado:** Alt+Shift+F salva a página em PDF, Alt+Shift+S inicia uma seleção e Alt+Shift+D roda o preset padrão. Eles podem ser alterados na página de atalhos do navegador.
- **Menu do botão direito:** salve a página, inicie uma seleção ou área, salve o conteúdo principal em Markdown, exporte tabelas para Excel ou rode qualquer preset. O resultado aparece no ícone da barra de ferramentas.
- **Exportar várias abas.** Escolha abas da janela atual, aplique um preset e baixe um ZIP (com um relatório de cada aba) ou um único PDF combinado. Cada aba mostra seu progresso, e as exportações concluídas são baixadas mesmo quando algumas abas falham.
- **Configurações e histórico.** Defina o padrão de nome de arquivo (`{title}`, `{date}`, `{time}`, `{host}`, `{label}`), o cabeçalho e rodapé do PDF, o preset padrão, e mantenha ou limpe a lista local de exportações recentes.

Enquanto um PDF, imagem ou arquivo é capturado, o navegador mostra uma barra informando que o Web2Doc começou a depurar o navegador; ela some quando a captura termina. Feche o DevTools da aba antes de capturar. O conteúdo de frames pode ser salvo como um frame inteiro, mas não escolhido parte por parte.

## Começo rápido

### Requisitos

- Node.js 26.13 ou superior na linha 26.x LTS e npm (`.nvmrc` fixa a versão de desenvolvimento)
- Google Chrome ou outro navegador baseado em Chromium com suporte a extensões Manifest V3

### Compilar e carregar a extensão

```sh
npm ci
npm run build
```

1. Abra `chrome://extensions` no navegador.
2. Ative o **Modo do desenvolvedor**.
3. Selecione **Carregar sem compactação** e escolha a pasta `dist/` gerada.
4. Abra uma página comum e selecione o ícone do Web2Doc na barra de ferramentas.

Execute `npm run build` novamente após alterar os arquivos-fonte e use **Recarregar** no cartão da extensão para carregar a nova versão.

## Como funciona

```text
Tabelas e documentos:  popup -> script de conteúdo -> exportador da página -> download pelo service worker
Parte da página:       popup -> script de conteúdo -> ferramentas de seleção -> página preparada -> captura no service worker
Página e ferramentas:  popup -> service worker em segundo plano -> serviço de captura (protocolo DevTools)
Presets e lotes:       popup, menu, atalho ou página de lote -> motor de exportação -> script de conteúdo ou serviço de captura
```

O código-fonte está agrupado por recurso:

- `src/popup/` é o popup da barra: `popup.ts` liga as ações, `TabExportService.ts` as envia para a página ou para o segundo plano, e `TablePicker.ts` é a lista de tabelas.
- `src/content/` roda na página: `ContentRouter.ts` valida e encaminha os pedidos, e `PageExporter.ts` monta tabelas, documentos e o inventário de links.
- `src/selection/` é o recurso "salvar parte da página": `SelectionPanel.ts` desenha os contornos e o painel, `SelectionController.ts` conduz as etapas (escolher, editar, revisar, salvar, Esc e falhas), e `PageSelection.ts` registra as alterações do usuário e as aplica temporariamente na página, restaurando depois cada atributo, texto e link.
- `src/tables/` encontra tabelas, lê as células, formata o CSV e desenha os contornos do seletor.
- `src/document/` transforma parte da página em um modelo de documento (títulos, listas, tabelas, código, links, imagens, notas).
- `src/formats/` grava arquivos sem bibliotecas externas: ZIP, XLSX (com as regras de valores das células), DOCX e Markdown/JSON.
- `src/background/` concentra o trabalho privilegiado: `BackgroundRouter.ts` decide quais pedidos são aceitos, `PageCaptureService.ts` captura PDFs, imagens, arquivos e arquivos de imagem por `chrome.debugger`, e `ExportEngine.ts` executa presets e exportações em lote.
- `src/pages/` contém as páginas da extensão: configurações e histórico, exportação em lote, reconhecimento de texto e comparação de capturas.
- `src/shared/` reúne o que todos os contextos usam: tipos de mensagens e suas verificações em tempo de execução, nomes de arquivos e downloads, armazenamento das configurações, comparação de linhas, QR Codes e a camada sobreposta à página.

O service worker aceita pedidos de captura apenas das páginas da própria extensão ou do script de conteúdo no frame principal da aba capturada. O script de conteúdo está configurado para todas as URLs, mas páginas internas e restritas do navegador não o permitem, então o popup explica que essas páginas não podem ser exportadas.

Para desenvolvimento, `npm run dev` compila em modo watch e abre o Chrome com um perfil separado e a extensão já carregada; cada nova compilação recarrega a extensão. Passe uma página inicial com `npm run dev -- <url>` ou defina `CHROME_PATH` para usar outro navegador Chromium.

## Desenvolvimento

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run test:browser
```

- `npm test` executa os testes unitários com dublês das APIs do navegador e do DOM, e `linkedom` para a extração de documentos.
- `npm run typecheck` confere os tipos da extensão, dos testes e dos scripts com o TypeScript 7.
- `npm run test:browser` carrega a extensão compilada no Chromium (`CHROME_PATH`, ou o Chromium instalado por `npx playwright install chromium`), usa cada recurso com cliques, teclas e arrastes reais pelo protocolo DevTools e depois abre cada arquivo baixado com pypdf, openpyxl, python-docx e Pillow. Execute `npm run build` antes. A exportação em lote precisa da permissão opcional `tabs`, que um navegador headless não consegue conceder pelo aviso, então o script usa uma cópia da build que a concede na instalação.

Execute `npm run check` para checagem de tipos, verificação de versão, testes unitários, build e pacote. O lockfile versionado torna as instalações reproduzíveis. O Webpack compila o TypeScript com o `esbuild-loader`; `isolatedModules` e `verbatimModuleSyntax` garantem que essa compilação por arquivo seja segura. Os bundles de produção usam ES2022, mantêm os avisos de licença no próprio arquivo, são gravados em ASCII para que todas as versões do Chromium os leiam como UTF-8 e não incluem source maps.

As bibliotecas usadas em tempo de execução vão dentro da extensão e nunca são carregadas da rede: `pdf-lib` (PDFs combinados e de imagem), `qrcode-generator` (QR Codes) e `tesseract.js` com seu núcleo WebAssembly e os dados de idioma em inglês e português (reconhecimento de texto).

Execute `npm run ci` localmente para fazer uma instalação limpa seguida de todas as verificações. O GitHub Actions executa o mesmo comando em Linux, Windows e macOS nos pushes (incluindo tags) e pull requests; também pode ser iniciado manualmente. A instalação limpa substitui `node_modules` pelas dependências do lockfile.

## Publicação de versões

As versões seguem o [versionamento semântico](https://semver.org/lang/pt-BR/) e são identificadas por tags Git no formato `vMAJOR.MINOR.PATCH`. A versão fica registrada em `package.json`, `package-lock.json`, `src/manifest.json` e no link de release e no badge de versão dos dois READMEs.

`npm run version:check` falha quando esses valores divergem. Use `-- --tag vX.Y.Z` para compará-los com uma tag planejada; nos builds de tag do GitHub Actions, a tag enviada é verificada automaticamente. `npm run package` compacta a pasta `dist/` em `release/web2doc-<versão>.zip` e depois relê o arquivo para confirmar que ele contém exatamente os scripts, páginas, ícones e arquivos de reconhecimento de texto esperados, que a versão do manifesto confere, que todo script é UTF-8 válido e que não há source maps. Os dois comandos fazem parte de `npm run check`.

Checklist de publicação:

1. Atualize a versão com `npm version <major|minor|patch> --no-git-tag-version` e depois atualize `src/manifest.json` e os badges e links de release dos dois READMEs.
2. Mova as entradas `Unreleased` do changelog para a nova versão e data.
3. Execute `npm run ci`, `npm run test:browser` e `npm run version:check -- --tag vX.Y.Z`.
4. Carregue `dist/` como extensão sem empacotamento em cada navegador Chromium suportado e teste as ações do popup, o salvamento de parte da página com cada ferramenta, o menu do botão direito e os atalhos, uma exportação em lote e o pedido de permissão da exportação em lote.
5. Faça o merge em `main`, crie e envie a tag `vX.Y.Z` e anexe `release/web2doc-<versão>.zip` ao release do GitHub.

## Permissões e acesso às páginas

| Permissão | Uso |
|---|---|
| `activeTab` | Acesso à aba em uso quando você abre o popup ou usa um atalho ou o menu do botão direito. |
| `debugger` | Gerar PDFs e imagens, salvar arquivos offline e ler os arquivos de imagem da página pelo protocolo DevTools. Só é conectado durante uma captura, apenas na aba capturada. |
| `downloads` | Salvar os arquivos criados pelo Web2Doc. |
| `storage` | Preferências, presets, histórico de exportações e capturas para comparação, guardados apenas neste navegador. |
| `contextMenus` | As opções do Web2Doc no menu do botão direito. |
| `tabs` (opcional) | Listar títulos e endereços das abas na página **Export several tabs**. Só é pedida quando você abre essa página e pode ser removida nos detalhes da extensão a qualquer momento. |

O manifesto não declara permissões persistentes em `host_permissions`, e nenhum dado sai do dispositivo. Por causa da permissão `debugger`, o navegador mostra um aviso mais forte ao instalar a extensão.

## Estrutura do projeto

```text
src/
  background/   background.ts, BackgroundRouter.ts, ExportEngine.ts, PageCaptureService.ts
  content/      content.ts, ContentRouter.ts, PageExporter.ts
  document/     extract.ts, model.ts
  formats/      cellValues.ts, docx.ts, markdown.ts, xlsx.ts, zip.ts
  pages/        páginas options, batch, ocr e compare, pages.css
  popup/        popup.html, popup.ts, TabExportService.ts, TablePicker.ts
  selection/    PageSelection.ts, SelectionController.ts, SelectionPanel.ts
  shared/       diff.ts, files.ts, messages.ts, PageOverlay.ts, qr.ts, settings.ts
  tables/       CSVFormatter.ts, TableHighlighter.ts, TableService.ts
  icons/
  manifest.json
schemas/
  web2doc-document-v1.schema.json
scripts/
  check-version.ts, dev.ts, package-extension.ts, release/
tests/
  *.test.ts     testes unitários
  browser/      verificação em navegador real (npm run test:browser)
webpack.config.js
```

Os testes são escritos em TypeScript e executados com `tsx`. `npm run typecheck` verifica tanto o código da aplicação quanto os testes; arquivos de teste compilados não são versionados.

## Licença

Este projeto está licenciado sob a [Licença MIT](LICENSE).
