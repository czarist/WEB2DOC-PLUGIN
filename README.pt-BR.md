<h1 align="center">Web2Doc</h1>

<h3 align="center">Exporte tabelas da web para CSV e salve páginas completas em PDF.</h3>

<p align="center">
  <a href="README.md">English</a> · <a href="README.pt-BR.md">Português (Brasil)</a>
</p>

<p align="center">
  <b>Uma extensão de navegador Manifest V3 para exportar tabelas da página ativa e salvar páginas como PDFs com estilo.</b>
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

- **Exportar tabelas escolhidas para CSV.** Lista as tabelas HTML visíveis da página ativa, cada uma com um número, um título tirado da legenda ou do título mais próximo, o tamanho e uma prévia da primeira linha. Cada tabela recebe na página um contorno com o mesmo número; passar o mouse ou focar um item da lista destaca a tabela e rola até ela. Marque as tabelas desejadas e baixe-as como `exported_tables.csv`. O texto das células é lido como aparece na tela, sem texto oculto nem estilos embutidos.
- **Retorno claro da exportação.** O popup informa quando a página ativa não tem tabelas ou não pode ser acessada.
- **Salvar uma página em PDF.** Captura a página ativa como ela aparece na tela, com estilos, fundos, imagens e links clicáveis, e baixa um PDF A4 com o título da página como nome. Antes da captura, o Web2Doc percorre a página para carregar imagens adiadas (lazy) e solta cabeçalhos fixos para que não se repitam em todas as páginas. O PDF inclui um sumário gerado a partir dos títulos da página.
- **Controles no popup.** Escolha uma das ações no popup da extensão.

A exportação de tabelas gera CSV, não uma planilha Excel `.xlsx`. Enquanto o PDF é gerado, o navegador mostra uma barra informando que o Web2Doc começou a depurar o navegador; ela some quando a captura termina. Feche o DevTools da aba antes de salvar um PDF.

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
4. Abra uma página comum com tabelas HTML e selecione o ícone do Web2Doc para exportar as tabelas ou imprimir a página.

Execute `npm run build` novamente após alterar os arquivos-fonte e use **Recarregar** no cartão da extensão para carregar a nova versão.

## Como funciona

```text
CSV: botão do popup -> script de conteúdo -> controlador de exportação -> lista de tabelas -> seletor no popup -> serviço CSV
PDF: botão do popup -> service worker em segundo plano -> serviço de PDF da página
```

- `src/popup.ts` e `src/services/TabExportService.ts` enviam ações de CSV para a aba ativa e ações de PDF para o service worker em segundo plano.
- `src/content.ts` encaminha a ação para `ExportController` e devolve o resultado ao popup.
- `src/controllers/ExportController.ts` lista as tabelas da página e exporta as escolhidas.
- `src/services/TableService.ts` encontra as tabelas visíveis, lê as células e gera o resumo exibido no seletor.
- `src/services/TableHighlighter.ts` contorna e numera as tabelas na página enquanto o seletor está aberto, por uma porta que se fecha junto com o popup.
- `src/TablePicker.ts` monta a lista de tabelas e a seleção no popup.
- `src/services/CSVService.ts` lê as tabelas da página e inicia o download de um CSV UTF-8.
- `src/services/CSVFormatter.ts` escapa os campos CSV e separa várias tabelas.
- `src/background.ts` aceita pedidos de PDF somente do popup.
- `src/services/PagePDFService.ts` se conecta à aba com `chrome.debugger`, prepara a página, gera o PDF com o comando `Page.printToPDF` do protocolo DevTools usando os estilos de tela e baixa o resultado.
- `src/manifest.json` define a extensão Manifest V3, o popup, o script de conteúdo, o service worker em segundo plano e as permissões.

O script de conteúdo está configurado para todas as URLs. Páginas internas do navegador e outras páginas restritas não permitem a execução de scripts de extensão, então as ações de exportação não ficam disponíveis nelas.

Para desenvolvimento, `npm run dev` compila em modo watch e abre o Chrome com um perfil separado e a extensão já carregada; cada nova compilação recarrega a extensão. Passe uma página inicial com `npm run dev -- <url>` ou defina `CHROME_PATH` para usar outro navegador Chromium.

## Desenvolvimento

Instale as dependências, execute os testes de CSV, mensagens e PDF e confira os tipos antes de compilar:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

O CSV usa campos entre aspas conforme as regras do formato, termina as linhas com CRLF e inclui BOM UTF-8 para facilitar o reconhecimento de textos acentuados em aplicativos de planilha.

Execute `npm run check` para todas as verificações. O lockfile versionado torna as instalações reproduzíveis. A checagem de tipos usa o TypeScript 7 (`tsc`). O Webpack compila o TypeScript com o `esbuild-loader`, que remove os tipos sem depender da API do compilador, que o TypeScript 7 não oferece mais; `isolatedModules` e `verbatimModuleSyntax` garantem que essa compilação por arquivo seja segura. Os bundles de produção usam ES2022 e não incluem source maps inline.

Execute `npm run ci` localmente para fazer uma instalação limpa seguida de todas as verificações. O GitHub Actions executa o mesmo comando em Linux, Windows e macOS nos pushes (incluindo tags) e pull requests; também pode ser iniciado manualmente. A instalação limpa substitui `node_modules` pelas dependências do lockfile.

## Publicação de versões

As versões seguem o [versionamento semântico](https://semver.org/lang/pt-BR/) e são identificadas por tags Git no formato `vMAJOR.MINOR.PATCH`. A versão fica registrada em `package.json`, `package-lock.json`, `src/manifest.json` e no link de release e no badge de versão dos dois READMEs.

`npm run version:check` falha quando esses valores divergem. Use `-- --tag vX.Y.Z` para compará-los com uma tag planejada; nos builds de tag do GitHub Actions, a tag enviada é verificada automaticamente. `npm run package` compacta a pasta `dist/` em `release/web2doc-<versão>.zip` e depois relê o arquivo para confirmar que ele contém exatamente `content.js`, `manifest.json`, `popup.html`, `popup.js` e os quatro ícones PNG em `icons/`, que a versão do manifesto confere e que não há source maps. Os dois comandos fazem parte de `npm run check`.

Checklist de publicação:

1. Atualize a versão com `npm version <major|minor|patch> --no-git-tag-version` e depois atualize `src/manifest.json` e os badges e links de release dos dois READMEs.
2. Mova as entradas `Unreleased` do changelog para a nova versão e data.
3. Execute `npm run ci` e `npm run version:check -- --tag vX.Y.Z`.
4. Carregue `dist/` como extensão sem empacotamento em cada navegador Chromium suportado e confirme a instalação, o seletor de tabelas e os destaques na página, o download do CSV das tabelas escolhidas (incluindo texto acentuado e importação em um aplicativo de planilha), a mensagem de página sem tabelas, o download do PDF (estilos, imagens e links), a mensagem de página restrita e as permissões solicitadas.
5. Faça o merge em `main`, crie e envie a tag `vX.Y.Z` e anexe `release/web2doc-<versão>.zip` ao release do GitHub.

## Permissões e acesso às páginas

A extensão solicita `activeTab` para a aba selecionada, `debugger` para gerar o PDF da aba ativa pelo protocolo DevTools e `downloads` para salvar esse PDF. O depurador só é conectado enquanto o PDF é gerado, apenas na aba escolhida e somente quando você escolhe a ação de PDF. O script de conteúdo usa o padrão de correspondência `<all_urls>` para funcionar em páginas comuns; páginas internas ou restritas do navegador continuam indisponíveis.

O manifesto não declara `storage`, `scripting` nem permissões persistentes em `host_permissions`. Por causa da permissão `debugger`, o navegador mostra um aviso mais forte ao instalar a extensão.

## Estrutura do projeto

```text
src/
  background.ts
  content.ts
  controllers/
    ExportController.ts
  services/
    CSVService.ts
    CSVFormatter.ts
    PagePDFService.ts
    TabExportService.ts
    TableHighlighter.ts
    TableService.ts
  TablePicker.ts
  types/
    ExportResult.ts
  icons/
    icon.svg
    icon-16.svg
    icon-*.png
  manifest.json
  popup.html
  popup.ts
scripts/
  check-version.ts
  package-extension.ts
  release/
webpack.config.js
tests/
  csv-formatter.test.ts
  export-services.test.ts
  popup.test.ts
  release.test.ts
  tab-export.test.ts
  helpers.ts
```

Os testes são escritos em TypeScript e executados com `tsx`. O comando `npm run typecheck` verifica o código da aplicação e dos testes; os arquivos compilados dos testes não são versionados.

## Licença

Este projeto é distribuído sob a [licença MIT](LICENSE).
