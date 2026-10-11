# Docverse — Sub-projeto 5: Assinatura qualificada ICP-Brasil por signatário (BirdID)

- **Data:** 2026-09-28
- **Status:** RASCUNHO — aguardando revisão do usuário e credenciais do BirdID
- **Base:** `main` após PR #1 (fundação) e PR #2 (deploy)

## Objetivo

Permitir que **cada signatário** de um documento assine com o **próprio certificado ICP-Brasil em nuvem** (assinatura qualificada, MP 2.200-2 art. 10 §1º / Lei 14.063 art. 4º III), convivendo no mesmo documento com signatários que assinam no fluxo simples (desenho + e-mail/OTP). Primeiro provedor: **BirdID** (Soluti). Arquitetura preparada para outros PSCs.

## Decisões do usuário (brainstorming 2026-09-28)

1. Nível **por signatário**, com três modos:
   - `SIMPLE` — fluxo atual (desenho/texto, OTP por e-mail opcional);
   - `QUALIFIED_REQUIRED` — só conclui com certificado ICP-Brasil;
   - `QUALIFIED_OPTIONAL` — assina no simples e, se quiser, "anexa" o certificado dele.
2. O documento pode exigir **todos qualificados** (atalho que marca todos como `QUALIFIED_REQUIRED`).
3. Primeiro ciclo: **só certificado em nuvem via BirdID**. A1 (.pfx) e A3 (token físico) ficam para depois.
4. Tudo gratuito e AGPL, implementado do zero (sala limpa em relação ao antigo `packages/ee/signing/csc`).

## O que a API do BirdID oferece (docs.vaultid.com.br)

Detalhes em `.superpowers/birdid-research.md` (fora do repo) — resumo:

- Base `https://api.birdid.com.br/v0`. Homologação: **não documentada** nas páginas públicas.
- OAuth2 Authorization Code + PKCE (`/oauth/authorize`, `/oauth/token`), `login_hint` = CPF/CNPJ, `lifetime` em segundos.
- Escopos: `single_signature` (1 hash), `multi_signature` (vários hashes numa chamada), `signature_session` (várias chamadas enquanto válido), `authentication_session` (só autenticação).
- `GET /oauth/certificate-discovery` → certificado (PEM) escolhido pelo titular.
- `POST /oauth/signature` com `hashes[{id, alias, hash, hash_algorithm: "2.16.840.1.101.3.4.2.1", signature_format: "RAW"|"CMS"}]` → `signatures[{id, raw_signature}]`.
- **Assinatura por push** (`POST/GET /async-signature` + `callback_url`), iniciada por CPF, com `lifetime` até 7 dias (PF) / 30 dias (PJ) — exige a permissão "assinatura por notificação" no painel do BirdID.
- Cadastro do app: `POST /oauth/application` ou **auto-cadastro** via JWS assinado com **certificado SSL ICP-Brasil do host** (as `redirect_uris` precisam ser do host do certificado).

## O problema central: quando o signatário assina criptograficamente

No Docverse (como no Documenso) os valores dos campos (assinatura desenhada, nome, data…) só são "carimbados" no PDF na **selagem**, depois que todos preencheram. Uma assinatura PAdES cobre os bytes do PDF: se o signatário A assinasse criptograficamente o PDF no momento em que preenche, os campos preenchidos depois por B alterariam o conteúdo e **invalidariam** a assinatura de A.

**Decisão de design (recomendada): assinatura em duas fases com sessão pré-autorizada.**

1. **Fase de preenchimento (como hoje):** o signatário qualificado preenche os campos e, ao concluir, é levado ao BirdID (OAuth + PKCE, `login_hint` com o CPF se informado, escopo `signature_session`, `lifetime` = prazo de expiração do documento, limitado ao máximo do BirdID). O Docverse guarda o token **criptografado** (chave de criptografia da instância) e o certificado escolhido. O signatário vê "Assinado — sua assinatura digital será aplicada quando todos concluírem".
2. **Fase de selagem (quando o último conclui):** o job de selagem gera o PDF final (campos carimbados + certificado de conclusão), depois aplica **uma assinatura PAdES por signatário qualificado**, em sequência, cada uma como atualização incremental, usando o token guardado; por fim aplica o **selo da plataforma** com carimbo do tempo (LTV). O token é descartado após o uso.
3. **Fallback:** se o token expirou ou foi revogado antes da selagem, o documento fica em `PENDING_QUALIFIED_SIGNATURE`; o signatário recebe e-mail (e push, se habilitado) com link para reautorizar só a assinatura digital; ao reautorizar, a selagem retoma.

Alternativa descartada: assinar na hora do preenchimento e proibir preenchimentos posteriores (obrigaria signatários qualificados a serem os últimos — ruim para o caso "empresa assina primeiro").

## Arquitetura

### Pacote novo `packages/qualified-signing` (AGPL)

| Módulo | Responsabilidade |
|---|---|
| `providers/types.ts` | Interface `QualifiedSignatureProvider`: `getAuthorizeUrl`, `exchangeCode`, `getCertificate`, `signHashes`, `revoke` |
| `providers/birdid/*` | Implementação BirdID (OAuth PKCE, certificate-discovery, signature RAW) com cliente HTTP isolado e testado com respostas gravadas |
| `remote-signer.ts` | Implementa o `Signer` do `@libpdf/core` (`sign(data, algorithm)` → SHA-256 → `provider.signHashes` RAW) e expõe certificado + cadeia (cadeia completada via AIA quando o provedor não a devolve) |
| `apply-qualified-signatures.ts` | Recebe o PDF final e a lista de signatários qualificados, aplica as assinaturas incrementais em ordem |
| `session-store.ts` | Persiste/recupera tokens criptografados, com expiração |

### Banco (migração nova)

- `Recipient.signatureLevel` enum `SIMPLE | QUALIFIED_REQUIRED | QUALIFIED_OPTIONAL` (default `SIMPLE`). Reaproveitar/limpar as colunas e enums herdados do CSC do Documenso é decidido no plano, olhando o schema — sem ler código do antigo `ee`.
- Tabela `QualifiedSignatureSession`: `recipientId`, `provider`, `certificatePem`, `certificateSubject` (nome/CPF extraídos), `encryptedAccessToken`, `expiresAt`, `status (AUTHORIZED | USED | EXPIRED | FAILED)`, `signedAt`.
- `EnvelopeStatus` ganha `PENDING_QUALIFIED_SIGNATURE` (ou flag equivalente — decidir no plano).

### UI

- Editor (quem envia): por signatário, seletor "Tipo de assinatura" (Simples / Certificado digital obrigatório / Simples com opção de certificado) e, no documento, "Exigir certificado de todos". Campo opcional de CPF do signatário (vira `login_hint` e é conferido com o CPF do certificado).
- Página de assinatura: para `QUALIFIED_*`, botão "Assinar com certificado digital (BirdID)" ao concluir; para `QUALIFIED_OPTIONAL`, opção explícita; tela de retorno do OAuth.
- Certificado de conclusão e auditoria: por signatário, nível (simples/qualificada), titular do certificado, emissor, número de série, CPF (mascarado) e horário.
- Admin da instância: configurar provedor BirdID (client_id, client_secret, ambiente) pela interface — atende o pedido de "interface para adicionar o certificado"; segredos criptografados no banco.

### Validação do CPF

Se o remetente informou CPF, a assinatura só é aceita se o CPF do certificado (OID 2.16.76.1.3.1 no SAN) for o mesmo. Sem CPF informado, registra o CPF do certificado no certificado de conclusão.

## Conformidade ICP-Brasil (pontos a validar num spike)

- **Política de assinatura:** assinaturas PAdES ICP-Brasil costumam carregar o atributo `SignaturePolicyIdentifier` (DOC-ICP-15.03, política AD-RB). O `@libpdf/core` não expõe esse atributo; o spike verifica (a) se o validador do ITI (`validar.iti.gov.br`) aprova a assinatura sem ele e (b) como injetá-lo (patch no `@libpdf/core` ou montagem do CMS própria).
- **Carimbo do tempo:** AD-RB não exige; AD-RT exige ACT ICP-Brasil (o BirdID tem gateway de ACT, pago). Primeiro ciclo: AD-RB + carimbo do tempo da plataforma no selo final.
- **Subfilter:** `ETSI.CAdES.detached` (padrão atual do Docverse).

## Testes

- Unitários: cliente BirdID contra respostas gravadas; `RemoteSigner` com provedor fake que assina com um certificado de teste; aplicação de N assinaturas incrementais preservando as anteriores (verificar cada assinatura com o próprio `@libpdf/core` ou `pdfsig`).
- Integração: fluxo completo com provedor **fake** (OAuth fake em container) — documento com empresa qualificada + cliente simples → PDF com 2 assinaturas (qualificada + selo) válidas.
- Aceitação real: com credenciais do BirdID e o seu certificado, assinar um documento e validar no `validar.iti.gov.br`.

## Bloqueios e perguntas abertas (para o usuário)

1. **Credenciais do BirdID (bloqueante para teste real):** precisamos de `client_id`/`client_secret`. Caminhos: (a) pedir cadastro à Soluti/BirdID (e perguntar se há ambiente de homologação); (b) auto-cadastro, que exige **certificado SSL ICP-Brasil** para o host (ex.: `docverse.termhub.dev`). Qual você prefere / já tem contato?
2. **Push (assinatura por notificação):** exige habilitar "assinatura por notificação" no painel do BirdID. Quer incluir já no primeiro ciclo (melhor UX no fallback) ou só OAuth?
3. **Validade jurídica desejada:** AD-RB (sem carimbo ICP) é suficiente no primeiro ciclo, ou precisa AD-RT com ACT ICP-Brasil (custo por carimbo)?
4. **CPF obrigatório** para signatário qualificado ou opcional?

## Fora de escopo

A1/A3, outros PSCs (a interface fica pronta), validação de assinaturas de terceiros, carimbo do tempo ICP-Brasil pago.
