# Docverse — Conformidade comparada com o DocuSeal (spike DOC-32)

- **Data:** 2026-10-17
- **Status:** estudo, sem implementação. Nada aqui muda produção.
- **Card:** DOC-32 (spike)

## Objetivo

Levantar o que o DocuSeal declara e o que ele implementa de fato em conformidade de assinatura eletrônica, comparar item a item com o Docverse de hoje e listar as lacunas, com prioridade, esforço e um card de implementação por lacuna relevante.

Escopo decidido pelo Pedro: Brasil (MP 2.200-2/2001, Lei 14.063/2020, ICP-Brasil, LGPD) e as normas internacionais que o DocuSeal cita (ESIGN, UETA, eIDAS, GDPR, 21 CFR Part 11, HIPAA, SOC 2, ISO 27001).

## Método e fontes

| Fonte | Versão | Como foi lida |
| --- | --- | --- |
| DocuSeal, código | `docusealco/docuseal` @ `3c65b0e` (2026-10-12) | clone raso num diretório de scratch, só leitura; nenhum script, build ou bundle dele foi executado |
| DocuSeal, declarações | README, docuseal.com/compliance, /security, /soc, /hipaa, /enterprise, /pricing, /privacy, /gdpr, FAQs e blog | lidas em 2026-10-17. `trust.docuseal.com` respondeu 403 e ficou de fora |
| Docverse, código | `origin/main` @ `ac0a575cb` | leitura do repositório; produção não foi tocada (o `.env.prod` não foi aberto) |
| Docverse, planos | DOC-22 (`docker/docverse/seal-cert/`) e PR #3 (spec BirdID, branch `docverse/qualified-signature-spec`) | leitura |

Cada afirmação leva uma etiqueta:

- **[código]**: fato conferido no código, com arquivo e linha.
- **[declaração]**: texto de site, README ou dica de interface sem lógica correspondente no código aberto. Inclui as declarações do DocuSeal Cloud, que roda código fechado.
- **[spec]**: só existe em spec ou procedimento do Docverse, ainda não em produção.

### O DocuSeal tem duas edições

A distinção pesa em quase toda linha da matriz.

- **Open source (self-hosted, AGPL):** é o que está no repositório. Os recursos "Pro" aparecem como stubs vazios ou como avisos "Unlock with DocuSeal Pro". Não estão no código, nem como chamada a um serviço remoto.
- **Pro / Cloud (pago, código fechado):** é a edição a que se referem quase todas as declarações de conformidade do site: SOC 2, ISO 27001, HIPAA, QES, KBA, SMS e certificado AATL. Não dá para conferir em código.

O alvo realista é o DocuSeal open source, onde o Docverse pode empatar ou passar. As declarações do Cloud servem de referência de mercado. Quando dependem de certificação da empresa, como SOC 2 e ISO, ficam fora de código (ver "Fora de escopo").

## O que o DocuSeal declara

| Norma | Declaração | Onde | Edição |
| --- | --- | --- | --- |
| ESIGN, UETA | "Electronic signatures and records are considered legally valid"; autenticação "via email or SMS"; trilha de auditoria | /compliance, blog | não diz a qual edição se aplica |
| eIDAS | SES incluída por padrão; AdES e QES "at an additional cost per signature" via QTSP parceiro (eID Easy) | /compliance, /privacy, /pricing | QES só no Cloud Pro |
| GDPR | dados do docuseal.eu ficam na UE (Irlanda) | /compliance, /gdpr, /privacy | Cloud |
| 21 CFR Part 11 | descrição de recursos (logs com horário, autenticação forte), sem atestado de validação | /compliance; no código, só duas dicas de interface (`config/locales/i18n.yml:924-925`) | não diz a qual edição se aplica |
| SOC 2 Type II, ISO 27001 | "DocuSeal Cloud services are SOC 2 / ISO 27001 certified" | /security, /soc | Cloud |
| HIPAA | "complies with HIPAA"; BAA só no "Pro Annual Cloud" | /hipaa, /security | Cloud |
| Brasil (MP 2.200-2, 14.063, ICP-Brasil, LGPD) | **nada** | busca no site e grep no código | — |
| README do open source | "compliance with local electronic document laws", sem citar lei | `README.md` | open source |

Conclusão: no Brasil o DocuSeal não serve de régua. Nesses itens a comparação é direto contra a lei.

## Base legal brasileira (resumo usado na matriz)

- **MP 2.200-2/2001, art. 10.** O §1º dá presunção de veracidade (art. 219 do Código Civil) ao documento assinado com certificado ICP-Brasil. O §2º admite outros meios de comprovar autoria e integridade, inclusive certificados de fora da ICP-Brasil, "desde que admitido pelas partes como válido ou aceito pela pessoa a quem for oposto". A assinatura simples do Docverse se apoia no §2º. A qualificada (PR #3) se apoia no §1º.
- **Lei 14.063/2020, art. 4º.** Classifica a assinatura em simples (I), avançada (II) e qualificada, que é a ICP-Brasil (III). A lei rege interações com entes públicos e alguns atos de saúde. Para contratos privados, quem manda é a MP 2.200-2, mas a classificação virou vocabulário de mercado.
- **ICP-Brasil (ITI).** A validação oficial é o `validar.iti.gov.br`. Para sair como "aprovada" lá, a assinatura precisa seguir uma política de assinatura do DOC-ICP-15.03 (AD-RB, AD-RT…). O carimbo do tempo com valor ICP-Brasil vem de ACT credenciada, que é serviço pago.
- **LGPD (Lei 13.709/2018).** Os artigos que importam aqui:
  - art. 6º (princípios de segurança e prevenção)
  - art. 9º (informação ao titular)
  - arts. 15-16 (término do tratamento e eliminação; guardar para cumprir obrigação legal ou exercer direito é permitido)
  - art. 18 (direitos do titular, inclusive portabilidade)
  - art. 37 (registro das operações)
  - art. 41 (encarregado, com contato público)
  - art. 46 (medidas de segurança)
  - art. 48 (comunicação de incidente)

## Onde o Docverse já está igual ou à frente do DocuSeal open source

Vale registrar para não reabrir.

| Item | Docverse | DocuSeal open source |
| --- | --- | --- |
| LTV / PAdES B-LTA | pronto no código: com TSA configurada, sai `timestampAuthority` + `longTermValidation` + `archivalTimestamp` [código `packages/signing/index.ts:44-57`] | `maybe_enable_ltv` é stub vazio, sem DSS, OCSP ou CRL; no máximo B-T [código `lib/submissions/generate_result_attachments.rb:827-829`] |
| Falha da TSA | o erro da libpdf sobe e o job de selagem falha e tenta de novo; não sela sem carimbo (inferido de `@libpdf/core` 0.5.1, `dist/index.mjs:42436`, sem `catch`) | em qualquer erro grava um `GeneralizedTime` local no lugar do token e o PDF sai sem carimbo válido, sem aviso [código `lib/submissions/timestamp_handler.rb:56-60`] |
| SubFilter | `ETSI.CAdES.detached` [código `packages/signing/index.ts:49`] | `ETSI.CAdES.detached` (padrão do HexaPDF, inferido) |
| Página de certificado dentro do PDF selado | sim, coberta pelo selo [código `packages/lib/jobs/definitions/internal/seal-document.handler.ts:367-377,462`] | trilha de auditoria em PDF separado, assinado com o mesmo certificado [código `lib/submissions/generate_audit_trail.rb:42-57`] |
| Lembretes automáticos | sim, liberados para todos [código `packages/lib/constants/envelope-reminder.ts:26-43`; migração `20260928000000_docverse_free_claim_flags`] | só no Pro (placeholder) |
| SSO | OIDC (Google, Microsoft, genérico) [código `.env.example:14-29`] | SAML só no Pro (placeholder) |
| Reautenticação na assinatura | conta, passkey, 2FA (e-mail ou app) e senha [código `packages/lib/types/document-auth.ts:58,73`] | só OTP por e-mail; SMS, KBA e documento são do Pro |
| Texto de consentimento | exibido nos diálogos de assinatura [código `document-signing-disclosure.tsx:9-27`] | o aviso existe, mas nenhuma view liga `data-with-disclosure` e ele nunca aparece [código `app/javascript/submission_form/signature_step.vue:321`] |
| "E-mail verificado" na trilha | só com OTP de fato | escreve "Verified" bastando um clique no link do e-mail [código `generate_audit_trail.rb:291`]. **Não copiar** |

## Matriz de lacunas

Escala usada nas duas últimas colunas:

- **Prioridade:** P0 = bloqueia a validade forte ou a defesa da prova no Brasil; P1 = paridade com o DocuSeal ou obrigação LGPD; P2 = melhoria ou mercado.
- **Esforço:** P = até 1 dia; M = 2 a 5 dias; G = mais de 1 semana.

### A. Selagem, certificado e carimbo do tempo

| # | Item | DocuSeal | Docverse hoje | O que falta | Prior. | Esforço |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Certificado do selo | **Open source:** cadeia autogerada `CN=DocuSeal`, RSA 2048, validade de **100 anos** [código `lib/generate_certificate.rb:4,33,55,77`]; aceita upload de PKCS#12 [código `app/controllers/esign_settings_controller.rb:45-121`]. **Pro:** AATL [declaração `/pricing`, stub `_default_signature_row.html.erb`] | autoassinado `CN=Docverse`, RSA 2048, 3 anos [spec `deploy-design.md`]; aceita qualquer PKCS#12 [código `packages/signing/transports/local.ts:5-40`] | executar a troca para e-CNPJ A1 (DOC-22, procedimento pronto e ainda não aplicado) | P0 | P (em andamento) |
| A2 | Carimbo do tempo (RFC 3161) | open source configurável por conta, sem padrão [código `lib/submissions/timestamp_handler.rb`; `lib/docuseal.rb:38`] | suportado [código `packages/signing/helpers/tsa.ts`], **vazio em produção** [spec `seal-cert/README.md:123-125`]. Sem TSA o selo é B-B e deixa de validar quando o A1 vencer | escolher a TSA (ACT ICP-Brasil paga ou TSA RFC 3161 pública) e configurar `NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY`; isso liga o B-LTA que já está no código | P0 | P + custo |
| A3 | Política de assinatura ICP-Brasil (AD-RB) | não tem | não tem; a libpdf não grava `SignaturePolicyIdentifier` [spec PR #3]; o README do DOC-22 avisa que o `validar.iti.gov.br` pode reprovar | spike: atributo assinado de política na CAdES, por patch na libpdf ou por um assinador próprio | P1 | M |
| A4 | Assinatura por signatário / qualificada | **Open source:** um selo da plataforma no fim (`single`) ou um por etapa (`multiple`) [código `generate_result_attachments.rb:1023-1043`]. **Cloud:** QES via eID Easy, US$ 2-4 por assinatura [declaração `/pricing`, `/privacy`] | só o selo da plataforma; o AES/QES do upstream foi removido [código `resolve-signature-level.ts:48-63`]; BirdID só na spec [spec PR #3] | implementar o PR #3 (ICP-Brasil qualificada via BirdID) quando houver credencial | P1 | G |
| A5 | Certificação DocMDP | não usa | não usa; a libpdf 0.5.1 não tem a opção | marcar o selo como assinatura de certificação para travar alterações posteriores; depende da libpdf | P2 | M |
| A6 | Verificar um PDF assinado | open source: tela e API `POST /api/tools/verify` [código `lib/verify_pdf_signature.rb`, `app/controllers/api/tools_controller.rb:20-38`]. **Fraco:** `verify_callback` sempre `true`, não confere cadeia, validade nem revogação, e "confiável" é só a chave bater com um certificado da própria conta [código `lib/verify_pdf_signature.rb:104-123`] | não tem; `/api/certificate-status` só diz se o certificado da instância abre [código `apps/remix/app/routes/api+/certificate-status.ts`] | página pública `/verificar`: upload do PDF; conferência do CMS, da cobertura do ByteRange, da cadeia até a raiz ICP-Brasil, do carimbo e do hash contra o banco; link para o `validar.iti.gov.br` | P1 | M |
| A7 | PDF/A | open source: `PDF_FORMAT=pdf/a-3b` opcional; trilha em PDF/A por padrão [código `generate_result_attachments.rb:770-773`, `generate_audit_trail.rb:88-92`] | não tem [código `seal-document.handler.ts:358,458-460`] | PDF/A-3b opcional para arquivamento; depende do suporte da libpdf | P2 | M |

### B. Trilha de auditoria e integridade

| # | Item | DocuSeal | Docverse hoje | O que falta | Prior. | Esforço |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Hash do documento | open source: SHA-256 do original e do final guardado [código `lib/templates/create_attachments.rb:75`, `generate_result_attachments.rb:820`, `process_submitter_completion_job.rb:92-94`] e impresso na trilha [código `generate_audit_trail.rb:220-235`] | **nenhum hash de conteúdo** é calculado, guardado ou mostrado; o SHA-256 só aparece como ETag HTTP [código `apps/remix/server/api/files/files.helpers.ts:114`] | SHA-256 do PDF original (no upload) e do final (depois do selo) em `DocumentData`; mostrar o do original na página de certificado e os dois na tela do envelope e no verificador (A6) | P0 | M |
| B2 | Trilha completa no PDF | sempre gera o PDF da trilha (eventos, IP, sessão, user agent, hashes) | página de certificado sempre; páginas de log de auditoria **desligadas por padrão** (`includeAuditLog @default(false)` [código `packages/prisma/schema.prisma:1039`]) | ligar por padrão para times novos e migrar os existentes | P0 | P |
| B3 | Eventos registrados | 24 tipos; IP, user agent, `session id` e usuário [código `app/models/submission_event.rb:44-69`, `lib/submission_events.rb:14-22`] | 38 tipos, com IP, user agent e horário do servidor [código `packages/lib/types/document-audit-logs.ts:13-64`, `schema.prisma:588-604`]; os tipos `DOCUMENT_RECIPIENT_CSC_*` estão órfãos | paridade de dados já atingida; falta o evento de consentimento (ver C1) e limpar os tipos CSC | P2 | P |
| B4 | IP do signatário | `request.remote_ip` do Rails | `getIpAddress` confia no primeiro `X-Forwarded-For` [código `packages/lib/universal/get-ip-address.ts:3-28`]. **Hoje é seguro em produção:** o nginx sobrescreve o XFF com `CF-Connecting-IP` (`docverse.termhub.dev.conf:19`) | defesa em profundidade: preferir `CF-Connecting-IP` quando houver proxy configurado, para não depender do nginx | P2 | P |
| B5 | Webhook assinado | HMAC-SHA256 com horário, tolerância de 5 min e comparação em tempo constante [código `lib/webhook_urls/signatures.rb`] | manda o segredo puro no cabeçalho `X-Documenso-Secret` [código `packages/lib/server-only/webhooks/execute-webhook-call.ts:40`] | assinatura HMAC (`X-Docverse-Signature: t=…,v1=…`), mantendo o cabeçalho antigo por compatibilidade | P2 | P |

### C. Signatário: consentimento e autenticação

| # | Item | DocuSeal | Docverse hoje | O que falta | Prior. | Esforço |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | Consentimento à assinatura eletrônica | o aviso existe no Vue, mas fica desligado no open source; sem caixa de aceite e sem evento [código `signature_step.vue:321`, `form.js:53`] | texto passivo, sem aceite explícito e sem evento; o texto é herdado dos EUA e não cita a lei brasileira [código `document-signing-disclosure.tsx:9-27`, `articles.signature-disclosure.tsx`] | caixa de aceite ou aceite explícito no primeiro acesso, evento `DOCUMENT_RECIPIENT_CONSENTED` com versão do texto, IP e horário na trilha; texto pt-BR citando a MP 2.200-2, art. 10, §2º, e a Lei 14.063, art. 4º; aceite e versão no certificado | P0 | M |
| C2 | OTP por e-mail | open source [código `lib/submitters/authorized_for_form.rb:29-42`] | sim, 2FA por e-mail com 6 dígitos [código `generate-2fa-credentials-from-email.ts:21-38`] | — (paridade) | — | — |
| C3 | SMS / telefone | **Pro** (sem rotas no open source) [código `config/routes.rb`, `_send_sms_button.html.erb`] | não tem | OTP por SMS ou WhatsApp com provedor configurável; evento na trilha | P2 | M + custo |
| C4 | KBA / documento de identidade | **Cloud** (Veratad, US$ 2 por uso) [declaração `/pricing`, `/privacy`]; o open source só tem a tela Vue, sem backend | não tem | no Brasil, o caminho é gov.br ou validação biométrica (por exemplo Serpro Datavalid); depende de contrato e cobre parte do que o BirdID já entrega | P2 | G |
| C5 | 2FA da conta, força de MFA | TOTP com "force MFA" por conta [código `app/models/account_config.rb:30`] | TOTP, códigos de backup e passkeys; sem "exigir 2FA" por organização | opção de exigir 2FA para os membros da organização | P2 | M |

### D. Dados pessoais, retenção e segurança (LGPD/GDPR)

| # | Item | DocuSeal | Docverse hoje | O que falta | Prior. | Esforço |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Política de privacidade, termos, encarregado | Cloud com política e DPA via SCC [declaração `/privacy`]; o open source não traz nada | só URLs externas opcionais (`NEXT_PUBLIC_PRIVACY_URL`, `NEXT_PUBLIC_TERMS_URL`) [código `packages/lib/constants/app.ts:55-56`]; sem encarregado (art. 41) | páginas `/privacidade` e `/termos` em pt-BR, com contato do encarregado, bases legais (execução de contrato e exercício regular de direito para a trilha), operadores (Mailgun, Cloudflare) e prazo de retenção; link no rodapé, nos e-mails e na tela de assinatura. O texto jurídico é do Pedro ou de um advogado; o card entrega a estrutura | P1 | M |
| D2 | Retenção e eliminação | sem política nem expurgo no open source; Cloud diz "only for as long as necessary" [declaração `/privacy`] | sem política nem job de expurgo; documento concluído sofre soft delete e a conta excluída passa os envelopes para uma conta de serviço [código `delete-document.ts:145-195`, `orphan-envelopes.ts:11-46`] | definir prazos (por exemplo, guarda do documento concluído pelo prazo prescricional) e um job que elimine soft deletes vencidos; documentar no D1 | P1 | M |
| D3 | Direitos do titular (acesso, portabilidade) | sem exportação no open source | exclusão de conta existe; **não há exportação** de dados | "baixar meus dados" (JSON e PDFs) nas configurações e um fluxo de pedido do titular que não tem conta (signatário) | P1 | M |
| D4 | Criptografia em repouso | só segredos (`EncryptedConfig`, tokens, webhooks) [código `app/models/encrypted_config.rb:34`]; documentos dependem do storage | só segredos (TOTP, credenciais) [código `packages/lib/server-only/crypto/encrypt.ts`]; PDFs em base64 no Postgres [código `put-file.server.ts:77-93`] | os dois empatam. Para o art. 46: disco ou volume do Postgres cifrado no host, ou cifra de `DocumentData` na aplicação | P2 | M |
| D5 | Backups | n/a | `pg_dump` diário, 14 dias, **sem cifra e no mesmo host**; cópia off-site manual [código `docker/docverse/backup/`] | cifrar o dump (age ou gpg) e enviar off-site automaticamente; teste de restauração mensal | P1 | P |
| D6 | Registro de operações e resposta a incidente | n/a no código | não existe documento | ROPA curto (art. 37) e procedimento de incidente com prazo para a ANPD (art. 48) em `docs/` | P1 | P |
| D7 | Cookies | n/a | PostHog opcional e vazio por padrão; sem banner | só se a telemetria for ligada | P2 | P |
| D8 | Residência de dados | Cloud EU (Irlanda) e EUA [declaração `/gdpr`] | servidor próprio no Brasil, mas o Cloudflare termina o TLS | declarar na política de privacidade (D1) | — | — |

### E. Documentação e licença

| # | Item | DocuSeal | Docverse hoje | O que falta | Prior. | Esforço |
| --- | --- | --- | --- | --- | --- | --- |
| E1 | Página "validade jurídica" | /compliance cita ESIGN, UETA, eIDAS, GDPR e 21 CFR 11 | a landing só fala em "ICP-Brasil em breve" [código `apps/remix/app/components/docverse/landing-page.tsx:336-341`]; o app de docs herdado fala em nome do "Documenso" e cita ESIGN/GDPR, mas não está no deploy [código `apps/docs/content/docs/compliance/*.mdx`] | página `/validade-juridica` honesta: o que o Docverse é (SES hoje, selo ICP-Brasil, qualificada quando o PR #3 sair) à luz da MP 2.200-2 e da Lei 14.063, com nota curta sobre ESIGN e eIDAS. Remover ou reescrever o compliance do app de docs | P1 | P |
| E2 | 21 CFR 11, HIPAA | dicas de interface e páginas de marketing | `cfr21` e `hipaa` existem só como nomes de flag [código `packages/lib/types/subscription.ts:133-140`] | não declarar nada disso. Não são mercado do Docverse | — | — |

## Licença: dá para copiar código do DocuSeal?

O DocuSeal é **AGPL-3.0 com termo adicional pela seção 7(b)**. Texto integral de `LICENSE_ADDITIONAL_TERMS`:

> In accordance with Section 7(b) of the GNU Affero General Public License, a covered work must retain the original DocuSeal attribution in interactive user interfaces.

O que isso significa para o Docverse:

- A AGPL é compatível com o Docverse, que também é AGPL. Mas o termo 7(b) acompanha o código copiado. Se trecho do DocuSeal entrar no Docverse, a obra combinada passa a ter de manter a atribuição ao DocuSeal na interface. No DocuSeal, essa atribuição é o "Powered by DocuSeal", e removê-la é recurso pago.
- Não fica claro até onde o termo vale quando o trecho copiado é pequeno. É interpretação jurídica.
- Na prática a cópia nem é útil: o DocuSeal é Ruby (HexaPDF) e o Docverse é TypeScript (`@libpdf/core`).

**Recomendação:** nenhum código do DocuSeal foi copiado neste estudo, e nenhum card deve copiar. Os cards reimplementam a partir das normas (RFC 3161, ETSI EN 319 142 / PAdES, DOC-ICP-15) e do comportamento descrito aqui. Se um dia for preciso copiar, a decisão é do Pedro, depois de consulta jurídica.

## Fora de escopo (não é código)

- **SOC 2 Type II, ISO 27001 e HIPAA com BAA:** dependem de auditoria e certificação da empresa, não do software. O DocuSeal só as declara para o Cloud.
- **QTSP europeu (eIDAS QES) e AATL da Adobe:** o equivalente no Brasil é ICP-Brasil (A1 e A4). Entrar na AATL é processo comercial com a Adobe e só faria sentido se houver mercado fora do Brasil.
- **Texto jurídico** da política de privacidade e dos termos: o card D1 entrega a estrutura e o texto fica a cargo do Pedro ou de um advogado.

## Cards de implementação propostos

Um por lacuna relevante, em ordem de prioridade. A numeração DOC-xx fica a cargo de quem cria os cards no board.

### P0

1. **Configurar o carimbo do tempo do selo (A2).** Escolher a TSA (ACT ICP-Brasil paga, ou TSA RFC 3161 pública como primeiro passo) e configurar `NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY` em produção. Conferir num PDF selado que o resultado é B-LTA (DSS presente) e que ele valida no Adobe e no `validar.iti.gov.br`. Fazer junto ou logo depois da troca do DOC-22. Esforço P, mais o custo da ACT.
2. **Hash SHA-256 do documento (B1).** Calcular e gravar o SHA-256 do PDF original no upload e do PDF final depois do selo. Mostrar o do original na página de certificado e os dois na tela do envelope e na API. Migração com backfill do hash final dos envelopes já concluídos. Esforço M.
3. **Trilha de auditoria no PDF por padrão (B2).** `includeAuditLog` passa a valer `true` por padrão, com migração dos times existentes e revisão do layout em pt-BR. Esforço P.
4. **Consentimento eletrônico explícito e auditado (C1).**
   - Aceite explícito antes da primeira assinatura.
   - Novo tipo de audit log com a versão do texto.
   - Texto pt-BR e en citando a MP 2.200-2, art. 10, §2º, e a Lei 14.063, art. 4º.
   - Aceite registrado na página de certificado.

   Esforço M.
5. **Executar o DOC-22 (A1).** Já está no board. Entra aqui só para registrar a dependência com o card 1.

### P1

6. **Verificador público de PDF (A6).** Página `/verificar` e endpoint de API. Confere:
   - a cobertura do ByteRange;
   - o CMS;
   - a cadeia até as raízes ICP-Brasil, com revogação (OCSP/CRL);
   - o carimbo do tempo;
   - o hash contra o banco, só no próprio envelope ou por token, sem vazar dados entre contas.

   Mostra o link para o `validar.iti.gov.br`. Não repetir as falhas do verificador do DocuSeal (cadeia ignorada, lookup de hash sem escopo). Esforço M.
7. **Spike da política de assinatura AD-RB no selo (A3).** Gravar `SignaturePolicyIdentifier` na CAdES, por patch na `@libpdf/core` ou por um assinador próprio, e validar no ITI. Também desbloqueia o PR #3. Esforço M.
8. **Assinatura qualificada via BirdID (A4).** É o PR #3. Implementar quando houver credencial. Esforço G.
9. **Páginas de privacidade, termos e encarregado (D1 + D8).** Rotas `/privacidade` e `/termos` em pt-BR e en, contato do encarregado, links no rodapé, nos e-mails e na assinatura. Esforço M.
10. **Política de retenção e expurgo (D2).** Prazos definidos e um job que elimina soft deletes vencidos e dados de signatário sem envelope vivo, com o que foi eliminado registrado. Esforço M.
11. **Exportação de dados do titular (D3).** "Baixar meus dados" e um fluxo de pedido do signatário sem conta. Esforço M.
12. **Backups cifrados e off-site (D5).** Cifrar o `pg_dump` e mandar uma cópia off-site automaticamente, com teste de restauração. Esforço P.
13. **ROPA e procedimento de incidente (D6).** Documentos em `docs/`. Esforço P.
14. **Página de validade jurídica e limpeza do app de docs (E1).** Esforço P.

### P2

15. **Webhook com assinatura HMAC (B5).** Esforço P.
16. **Opção de exigir 2FA por organização (C5).** Esforço M.
17. **OTP por SMS ou WhatsApp (C3).** Esforço M, mais custo.
18. **PDF/A-3b opcional (A7)** e **DocMDP no selo (A5).** Os dois dependem da libpdf. Fazer um spike conjunto. Esforço M.
19. **Criptografia de documentos em repouso (D4).** Esforço M.
20. **Pequenos ajustes:** IP por `CF-Connecting-IP` (B4) e limpeza dos tipos de audit log CSC órfãos (B3). Esforço P.
21. **Verificação de identidade (gov.br ou biometria, C4).** Só depois do BirdID e se houver demanda. Esforço G.
