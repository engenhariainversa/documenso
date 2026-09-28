<p align="center">
  <img src="packages/assets/images/docverse-logo.svg" alt="Docverse" width="220">
</p>

<p align="center">
  Alternativa 100% open source (AGPLv3) para assinatura eletrônica de documentos.
  <br>
  Fork do <a href="https://github.com/documenso/documenso">Documenso</a>, sem código sob licença comercial e sem travas de licenciamento.
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-AGPLv3-purple" alt="Licença AGPLv3"></a>
</p>

## O que é o Docverse

O Docverse é uma plataforma de assinatura eletrônica de documentos — o mesmo tipo de produto que o DocuSign ou o Documenso, mas **100% open source, sob a licença GNU Affero General Public License v3.0 (AGPLv3), sem nenhuma feature paga, sem trava de licença e sem telemetria enviada para terceiros**.

O objetivo do projeto é oferecer uma base de código que qualquer pessoa ou organização possa auditar, rodar e modificar livremente, sabendo exatamente o que o software faz com os documentos e dados que passam por ele.

## Origem: fork do Documenso

O Docverse nasceu como um fork do [Documenso](https://github.com/documenso/documenso) (a partir da v2.18.0). O Documenso é um excelente produto, mas parte de suas funcionalidades avançadas é distribuída sob uma licença comercial (o antigo diretório `packages/ee`) e o produto hospedado depende de billing, licenciamento e telemetria próprios.

O Docverse faz um trabalho diferente a partir do mesmo código AGPL:

- **Remove por completo** o antigo `packages/ee` (código sob a licença comercial do Documenso). Nenhuma linha desse diretório foi copiada, adaptada ou usada como referência — o Docverse não contém, direta ou indiretamente, código sob a licença comercial do Documenso.
- **Reimplementa de forma independente**, sob AGPLv3, funcionalidades equivalentes às que dependiam desse código (por exemplo, limites de uso sempre ilimitados).
- **Remove billing/Stripe, licenciamento e telemetria** (ver seção abaixo).
- Mantém compatibilidade com o restante do código AGPL do Documenso (rotas de API `/api/v1`/`/api/v2`, variáveis de ambiente, nomes de pacotes `@documenso/*`), para facilitar o acompanhamento de mudanças do projeto original.

Este repositório permanece um fork ativo: quando fizer sentido, mudanças do upstream serão trazidas para o Docverse.

- Repositório do Docverse: <https://github.com/engenhariainversa/documenso>
- Repositório upstream (Documenso): <https://github.com/documenso/documenso>

## Licença: AGPLv3 e o que isso implica para quem hospeda

O Docverse é distribuído sob a [GNU Affero General Public License v3.0](./LICENSE) (AGPLv3), a mesma licença de base do Documenso.

Na prática, isso significa:

- Você pode **usar, estudar, modificar e redistribuir** o código livremente, inclusive para fins comerciais.
- Se você **hospeda uma instância modificada do Docverse e a disponibiliza para terceiros pela rede** (por exemplo, oferecendo o serviço a clientes ou usuários externos), a AGPLv3 (§13) exige que você **disponibilize o código-fonte completo dessa versão modificada** para quem usa o serviço.
- Por isso, todo usuário da instância vê um link **"Código-fonte"** apontando para o repositório correspondente — no rodapé do app autenticado (desktop e menu mobile), na página de assinatura (inclusive para signatários não autenticados), na página de conclusão da assinatura e no modo embutido (mesmo com a opção "Powered by" desativada). O componente único usado em todas essas telas é `apps/remix/app/components/general/source-code-link.tsx`. Se você mantiver um fork, ajuste o link (`APP_SOURCE_URL` em `packages/lib/constants/brand.ts`) para apontar para o seu próprio repositório público.
- Não é permitido remover esse link ou distribuir uma versão modificada sem também disponibilizar o código-fonte correspondente — isso violaria a licença.

Consulte o texto completo em [`LICENSE`](./LICENSE) e a atribuição ao projeto original em [`NOTICE`](./NOTICE).

## O que foi removido em relação ao Documenso

Em relação ao Documenso original, o Docverse removeu:

- **`packages/ee`** — todo o código sob a licença comercial do Documenso (billing, domínios de e-mail por organização, SSO por organização, assinatura remota/CSC, etc.). Onde fazia sentido, os pontos de chamada foram reimplementados de forma independente e 100% AGPL; features que ainda não têm reimplementação ficam desligadas/escondidas, sem nenhum código do `ee`.
- **Billing e Stripe** — não há planos pagos, cobrança, assentos pagos ou telas de billing/faturas.
- **Licenciamento** — não há chave de licença, verificação de licença expirada ou trava de features por licença.
- **Telemetria** — o telemetry client do Documenso (que reportava uso para servidores do Documenso) foi removido. Não há coleta de telemetria própria do produto por padrão.

Como consequência direta: **todas as funcionalidades do Docverse são gratuitas e estão disponíveis por padrão** em qualquer instância self-hosted, incluindo recursos que no Documenso dependiam de licença comercial ou de plano pago (por exemplo, marca branca / customização de marca, embed sem "Powered by", e reautenticação/OTP na assinatura).

O logo e o favicon atuais são **provisórios** (um wordmark em texto "Docverse") — a identidade visual definitiva será definida em uma etapa futura.

## Como rodar localmente

### Requisitos

- Node.js (v24 ou superior)
- Banco PostgreSQL
- Docker (opcional, recomendado para o ambiente de desenvolvimento)

### Passo a passo

1. Clone o repositório:

   ```sh
   git clone https://github.com/engenhariainversa/documenso.git docverse
   cd docverse
   ```

2. Configure o arquivo `.env` a partir do `.env.example`:

   ```sh
   cp .env.example .env
   ```

3. Suba a infraestrutura local (Postgres, mailserver, etc.) e instale dependências:

   ```sh
   npm run dx
   ```

4. Suba o servidor de desenvolvimento:

   ```sh
   npm run dev
   ```

   Ou, para fazer os dois passos acima de uma vez:

   ```sh
   npm run d
   ```

#### Pontos de acesso

1. **App** — <http://localhost:3000>
2. **Caixa de entrada de e-mails de teste** — <http://localhost:9000>
3. **Banco de dados** — porta `54320`
4. **Painel do S3 (armazenamento)** — <http://localhost:9001>

## Self-hosting e variáveis de ambiente

O Docverse mantém, quase integralmente, o mesmo modelo de configuração, variáveis de ambiente e opções de deploy (Docker, Docker Compose, Kubernetes, deploy manual) do Documenso. Onde o conteúdo é o mesmo, a documentação oficial do Documenso continua sendo a referência mais completa:

- [Documentação de self-hosting](https://docs.documenso.com/docs/self-hosting)
- [Deploy com Docker](https://docs.documenso.com/docs/self-hosting/deployment/docker)
- [Deploy com Docker Compose](https://docs.documenso.com/docs/self-hosting/deployment/docker-compose)
- [Configuração manual do ambiente de desenvolvimento](https://docs.documenso.com/docs/developers/local-development/manual)
- [Troubleshooting](https://docs.documenso.com/docs/self-hosting/maintenance/troubleshooting)

Ao seguir esses guias, ignore qualquer referência a billing, chaves de licença ou telemetria do Documenso — no Docverse essas partes não existem e todas as funcionalidades estão liberadas por padrão.

## Especificações e histórico de decisões

As specs e o histórico de decisões técnicas deste fork (o que foi removido, como e por quê) ficam em [`docs/superpowers/specs/`](./docs/superpowers/specs/).

## Stack técnica

- [TypeScript](https://www.typescriptlang.org/) — linguagem
- [React Router v7](https://reactrouter.com/) — framework
- [Hono](https://hono.dev/) — servidor
- [Prisma](https://www.prisma.io/) — ORM
- [Tailwind CSS](https://tailwindcss.com/) — CSS
- [shadcn/ui](https://ui.shadcn.com/) + [Radix UI](https://www.radix-ui.com/) — componentes
- [react-email](https://react.email/) — templates de e-mail
- [Lingui](https://lingui.dev/) — internacionalização
- [tRPC](https://trpc.io/) — API
- [@libpdf/core](https://www.npmjs.com/package/@libpdf/core) — assinaturas em PDF
- [pdf.js](https://mozilla.github.io/pdf.js/) — visualização de PDFs
- [@cantoo/pdf-lib](https://github.com/cantoo-scribe/pdf-lib) — manipulação de PDF
- [Biome](https://biomejs.dev/) — lint e formatação
- [Playwright](https://playwright.dev/) — testes E2E

## Segurança

Se você encontrar uma vulnerabilidade de segurança, veja [`SECURITY.md`](./SECURITY.md) para saber como reportar.

## Licença e atribuição

- [`LICENSE`](./LICENSE) — texto completo da AGPLv3 (mantido sem alterações).
- [`NOTICE`](./NOTICE) — atribuição ao projeto original (Documenso) e informações sobre o que este fork não inclui.
