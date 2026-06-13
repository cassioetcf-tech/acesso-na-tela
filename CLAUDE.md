# Acesso na Tela — Contexto do Projeto (CLAUDE.md)

Portal brasileiro de filmes acessíveis (AD, LSE, Libras) para pessoas com
deficiência visual, auditiva e surdocegueira. Iniciativa da ETC Filmes.

> Este arquivo é lido automaticamente pelo Claude Code a cada sessão. Ele é a
> fonte de contexto do projeto. **Não inclua segredos aqui** (senha do admin,
> chaves privadas) — este arquivo é versionado num repositório público.
>
> Última revisão: jun/2026 — **migração TMDb → Ingresso.com** como fonte de dados
> dos filmes (poster, ficha técnica, sinopse, trailer), cacheada em
> `filmes.ingresso_data`. TMDb removido de home, filme, admin e newsletter.
> Trate números de volume (contagens de filmes) como aproximados,
> pois mudam diariamente pela sincronização.

---

## 1. Regras inegociáveis

1. **HTML + CSS + JS vanilla. Sem framework, sem build step.** O público usa
   leitores de tela; HTML puro é mais confiável para acessibilidade do que SPAs.
   Nunca introduzir React, Vue ou similares.

2. **Acessibilidade é filtro de toda decisão técnica.** WCAG 2.2 AA + ABNT NBR
   17225. Qualquer mudança de markup, interação ou contraste passa por esse
   critério primeiro.

3. **Campo `status` no Supabase é sempre MAIÚSCULAS** (`CARTAZ`, `BREVE`,
   `CATALOGO`). Toda query usa `ilike`, nunca `eq`:
   - ✅ `GET /rest/v1/filmes?status=ilike.catalogo`
   - ❌ `GET /rest/v1/filmes?status=eq.catalogo`

4. **Ingresso.com exige proxy.** Chamadas diretas do browser são bloqueadas por
   CORS. Sempre usar a Edge Function `/api/ingresso`.

5. **Scraping de redes de cinema não funciona** (Cinépolis e similares retornam
   403). Cadastro de filmes/sessões é manual via `/admin.html`.

7. **Cache de JS/CSS não usa mais `immutable`.** Os arquivos não têm hash no
   nome, então JS/CSS são servidos com `max-age=0, must-revalidate` (ver
   `netlify.toml`). Se mudar um JS/CSS e parecer que "não atualizou", peça um
   hard refresh (Ctrl+Shift+R) UMA vez — assets antigos cacheados como
   `immutable` (deploys antigos) só somem assim. Para forçar, versione o
   include: `admin.js?v=YYYYMMDD`.

6. **Verificar a versão dos arquivos no GitHub antes de depurar.** Já houve
   sobrescrita acidental de arquivos corrigidos. Um bug reaparecer pode
   significar que o arquivo foi revertido no repositório, não que o código está
   errado. (Verificado nesta revisão: o que está no `main` é o que está
   deployado — o Netlify publica estático a partir do `main`.)

---

## 2. Acessos

| Serviço | Referência |
|---|---|
| Produção | https://acessonatela.com/ |
| Admin | https://acessonatela.com/admin.html (login client-side — ver §9) |
| GitHub | https://github.com/cassioetcf-tech/acesso-na-tela |
| Netlify | app.netlify.com — projeto `stunning-nasturtium-cec653` |
| Supabase URL | `https://gpwmmvaetokgrzekepbk.supabase.co` |

Chaves e tokens (Supabase publishable key, TMDb read token, partnership da
Ingresso) ficam em **`js/config.js`** (objeto `CONFIG`). São de baixo risco
(publishable / `api_read`) e já públicas no repositório — não duplicar aqui.

**Segurança a melhorar:** o login do admin é client-side e fraco por natureza.
A senha não é mantida neste arquivo de propósito. Endurecer isso é um item
futuro; não tratar como confidencial real hoje.

Netlify plano gratuito: 100 GB bandwidth/mês · 125.000 execuções de Edge
Functions/mês. Se o site pausar por limite, reativar no painel.

---

## 3. Stack técnica

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS + JavaScript vanilla |
| Deploy | Netlify — arquivos estáticos, sem build step, deploy a partir do `main` |
| API de filmes | **Ingresso.com** (poster, ficha técnica, sinopse, trailer) via Edge Function proxy — TMDb foi removido (jun/2026) |
| API de sessões | Ingresso.com via Edge Function proxy |
| Banco de dados | Supabase REST (chamado direto do browser) |
| Libras | VLibras — widget oficial do Governo Federal |
| Fontes | Google Fonts: Inter + Fraunces |
| Imagens dos filmes | CDN do Ingresso (`images[].url` — webp, URL completa) cacheado em `filmes.ingresso_data.poster` |

---

## 4. Estrutura do repositório (corrigida)

> A estrutura real é mais modular do que descrições antigas indicavam.

```
acesso-na-tela/
├── index.html                  ← Home
├── filme.html                  ← Detalhe do filme (PÁGINA EM PRODUÇÃO)
├── catalogo.html               ← Catálogo de streaming
├── catalogo-filme.html         ← Detalhe acessado a partir do catálogo (catalogo.js linka pra cá)
├── admin.html                  ← Painel de administração
├── aplicativos.html            ← Página dos apps de acessibilidade
├── cinema.html / cinemas.html  ← Páginas de cinema(s) — cinemas.html fora do nav (em pausa)
├── acessibilidade.html         ← Página sobre acessibilidade
├── sobre.html                  ← Sobre o projeto
├── contato.html                ← Página de contato (form → função contato.js/Resend)
├── faq.html                    ← Perguntas frequentes
├── acesso-na-tela-filme.html   ← LEGADO/MORTO: não é referenciado por nada. Não usar.
├── netlify.toml                ← Edge Functions + cron + headers
├── assets/                     ← logo, favicons e logos dos apps (app-*.png)
├── css/
│   ├── base.css
│   ├── components.css          ← inclui estilos dos cards de app e .app-logo-*
│   ├── a11y.css
│   └── pages/                  ← home, catalogo, filme, admin, cinema(s), faq, sobre, acessibilidade, aplicativos
├── js/
│   ├── config.js   utils.js   a11y.js
│   ├── api/        supabase.js  tmdb.js  ingresso.js
│   ├── components/ header.js  footer.js  film-card.js
│   └── pages/      home.js  catalogo.js  filme.js  admin.js  aplicativos.js  cinema.js  cinemas.js  faq.js
└── netlify/
    ├── edge-functions/ ingresso.js  catalog.js
    └── functions/      sync-status.js  a11y-sources.js
```

**Página de detalhe:** a de produção é **`filme.html`** (linkada por `film-card.js`,
`cinema.js`, `cinemas.js`, `catalogo.js`? — ver nota). `acesso-na-tela-filme.html`
é legado e não referenciado. Atenção: `catalogo.js` linka os cards do catálogo
para `catalogo-filme.html`, enquanto o resto do site usa `filme.html` — há duas
páginas de detalhe em uso conforme a origem do clique. Confirmar a intenção antes
de unificar.

---

## 5. Banco de dados — Supabase

### Tabela `filmes` (schema corrigido)
```
id           text PK    → DUAS convenções (ver "Modelo de dados" abaixo)
titulo       text
ingresso_url text
url_key      text       → slug da Ingresso; usado em filme.html?urlKey={url_key}
app          text       → 'MovieReading' | 'MLOAD' | 'GRETA' | 'PingPlay' | 'Trio Cinema' | 'Conecta Acessibilidade' | null
app_status   text       → 'pendente' | 'confirmado'   ← COLUNA REAL, não estava no doc antigo
status       text       → 'CARTAZ' | 'BREVE' | 'CATALOGO'  (SEMPRE MAIÚSCULAS)
ingresso_data jsonb      → dados cacheados do Ingresso.com: {title, originalTitle,
                          poster (URL completa), genres[], duration (min), contentRating,
                          synopsis, countryOrigin, distributor, premiereDate (ISO localDate)}
tmdb_id      int         → LEGADO (TMDb removido jun/2026; coluna pode existir, não é usada)
tmdb_data    jsonb       → LEGADO (idem — não ler/escrever; usar ingresso_data)
a11y         jsonb       → {"ad": true, "lse": true, "libras": true}
created_at   timestamp
updated_at   timestamp
```

### Modelo de dados — convenções de `id` (importante)
- **`film_{urlKey}`** — inserido pelo pipeline da Ingresso (`sync-status.js` e o
  sync do admin). Tem `url_key` → o card monta link clicável para `filme.html`.
- **`app_{fornecedor}_{slug}`** — vem de uma **aplicação paralela** (externa a
  este repositório) que centraliza dados detalhados dos apps. Esses registros
  **não têm `url_key`** e podem não ter `tmdb_id`. Foram uma carga inicial,
  limpa manualmente, e **não devem voltar a ocorrer** (confirmado pelo time). Se
  reaparecerem em volume, o sintoma é cards da home com `href="#"` (sem
  `url_key`). O `sync-status.js` deste repo NÃO cria nem apaga registros `app_*`.

### Cadastro de usuários (newsletter + comentários)
- ⚠️ **A TABELA SE CHAMA `newsletter`** (NÃO `newsletter_subscribers` — esse nome,
  usado em versões antigas do código, nunca existiu no banco; verificado em produção).
- **`newsletter`** é o cadastro único de usuários (newsletter, hero e comentários
  alimentam a mesma tabela). Colunas originais: `id uuid, nome, email (unique),
  created_at`. Acrescentadas na Fase 1: `celular (E.164 +55…), prefs jsonb,
  aceita_email bool, aceita_whatsapp bool, email_verificado bool, origem text,
  updated_at`. (Não tem `subscribed_at` — usa `created_at`.)
- **Gravação SEMPRE via RPC `upsert_subscriber`** (SECURITY DEFINER) — faz merge
  (acumula nome/celular, não descarta em duplicado), normaliza e-mail (lowercase)
  e celular (E.164). O front chama `supabaseRpc('upsert_subscriber', {p_email, p_nome,
  p_celular, p_prefs, p_aceita_email, p_aceita_whatsapp, p_origem})`. Helper
  `_saveSubscriber` em home.js, com fallback para insert direto se a RPC faltar.
- **Padrão de consentimento na criação:** o INSERT da RPC usa
  `coalesce(p_aceita_email,false)` — cadastro novo SEM consentimento explícito fica
  `aceita_email=false`. Newsletter/hero passam `true` explícito; comentário só passa
  `true` se a pessoa marcar o opt-in. (Update por conflito nunca rebaixa: `null` mantém.)
- **Comentário (relatos) cadastra na própria página** — não bloqueia mais quem não é
  cadastrado nem redireciona. No envio: valida nome+email+texto, faz upsert
  (`upsert_subscriber`, opt-in de e-mail opcional via checkbox) e grava o relato com
  `comentarios.email` + `comentarios.subscriber_id`. (RPC `email_cadastrado` continua
  existindo, mas não é mais usada para bloquear.)
- Verificação real de posse do e-mail (OTP) e envio de WhatsApp = fase 2.
- **E-mail de boas-vindas:** ativo via `welcome.js` (Resend) + Database Webhook.
- **Descadastro:** página `descadastro.html?email=` → botão chama `upsert_subscriber`
  com `p_aceita_email=false` (reaproveita a RPC; reversível). O e-mail de boas-vindas
  linka para ela e instrui a NÃO responder (endereço de envio não recebe).

### Outras tabelas
```
newsletter              → ver "Cadastro de usuários" acima (nome real da tabela)
comentarios             → id uuid, filme_url_key, autor, email, subscriber_id (FK),
                          texto, cinema, aprovado bool, created_at

filmes_scaneados        → titulo text, app text  ← catálogo escaneado pela aplicação
                          paralela (Opção A). Valores de `app`: MovieReading | Conecta
                          | MLOAD | Trio. Usada na FASE 3 do sync (§7). NÃO contém
                          PingPlay nem GRETA (essas fontes vêm de scraping próprio).

film_app_suggestions    → id uuid PK
                          film_id uuid FK filmes(id)
                          app_slug text          -- 'moviereading' | 'pingplay' | 'mload' | 'greta' | 'trio'
                          app_film_title text    -- título como aparece no app
                          match_score int        -- 0-100
                          synced_at timestamptz
                          confirmed bool DEFAULT false
                          confirmed_at timestamptz
                          confirmed_by text
                          UNIQUE (film_id, app_slug)
                          [TABELA PLANEJADA — criada quando a Opção A entrar em produção]
```

### RLS
- `filmes`: leitura pública, escrita via chave anon.
- `newsletter`: gravação via RPC `upsert_subscriber` (SECURITY DEFINER).
- `comentarios`: leitura só de aprovados (`aprovado = true`), inserção pública.

---

## 6. Integrações externas

**TMDb** — ❌ **REMOVIDO (jun/2026).** Os dados do filme vêm do Ingresso. O arquivo
`js/api/tmdb.js` e a coluna `tmdb_data` ainda existem como legado, mas não são
usados por home/filme/admin/newsletter. Não reintroduzir.

**Ingresso.com** — partnership `locomotivadigital`. Proxy `/api/ingresso`:
- `?urlKey={urlKey}` → **objeto completo do evento** (id/eventId, title, originalTitle,
  duration, genres[], distributor, contentRating, synopsis, countryOrigin, images[]
  (PosterPortrait/PosterHorizontal `.url`), trailers[], **premiereDate** = objeto
  `{localDate, year, dayAndMonth}`). É a fonte de poster + ficha técnica + sinopse.
- `?eventId={id}&city={cityId}&date={YYYY-MM-DD}` → sessões por cinema
- `?type=nowplaying` → lista/ordem de em-cartaz (usado pela home, cacheado em localStorage)
Cidades: 1=SP · 2=RJ · 3=BH · 4=BSB · 5=CWB · 6=POA · 7=SSA · 8=REC · 9=FOR · 10=MAO.
Cidade padrão na home: `1011` (código interno SP).

**VLibras** — `https://vlibras.gov.br/app/vlibras-plugin.js`, init
`new window.VLibras.Widget('https://vlibras.gov.br/app')`. Acionado pela barra de
acessibilidade em todas as páginas.

---

## 7. Automações (Netlify)

**`sync-status.js` — cron diário 6h UTC** (`schedule = "0 6 * * *"` no netlify.toml).
1. **FASE 1 — Ingresso (descoberta + dados):** descobre filmes em cartaz; insere
   novos como `id: film_{urlKey}`, com `url_key`, `status` CARTAZ/BREVE (via
   `isComingSoon`) e `app_status: pendente`. Para cada filme com `url_key`, busca
   o evento no Ingresso (`getIngressoEvent`) e cacheia o subconjunto em
   `ingresso_data` (poster, ficha, sinopse, premiereDate). Verifica sessões na
   semana: filme em CARTAZ sem sessão → rebaixado para CATALOGO (sai da home).
2. **FASE 2 — Apps:** varre **TODOS** os filmes com sessão na semana (status
   CARTAZ, não só pendentes) e cruza com as fontes, promovendo para
   `app_status: confirmado`. Fontes (prioridade nessa ordem):
   - **Tabela `filmes_scaneados`** (Supabase): MovieReading, Conecta, MLOAD, Trio.
     Lê colunas `titulo` + `app`; `canonApp()` normaliza o valor para o nome
     canônico de `filmes.app`. Tabela populada pela aplicação paralela (Opção A).
   - **PingPlay**: scraping `pingplay.com.br/catalogo.php` (mantido).
   - **GRETA**: scraping `filmeb.com.br` — distribuidora Paramount Pictures
     (ID `310086`, constante `FILMEB_PARAMOUNT_ID`, fixo por enquanto). Janela
     de datas ano-1 → ano+1. Filmes da Paramount no filmeb = filmes no GRETA.
   AD/LSE/Libras sempre marcados como `true` ao classificar (exceto PingPlay no
   admin.js, que traz os recursos individuais da API).

> A Fase 3 (TMDb) foi **removida** (jun/2026). Os dados do filme agora vêm 100%
> do Ingresso (cacheados em `ingresso_data` na Fase 1). O admin.html tem uma
> Fase 3 própria (client-side) que só enriquece `ingresso_data` de filmes em
> cartaz que ainda estejam sem ele.

> Só filmes com algum app seguem na home, e como vieram da Ingresso, todos têm
> `url_key` e são clicáveis. As fases ENRIQUECEM filmes existentes; não criam
> filmes a partir dos apps.

**`a11y-sources.js`** — function que LÊ as fontes server-side e retorna
`{ pingplay, pingplay_details, greta }` para a Fase de apps do **admin.js** cruzar
(scraping de filmeb/Paramount precisa ser server-side por causa de CORS).
MovieReading/Conecta/MLOAD/Trio NÃO passam por aqui — vêm da tabela
`filmes_scaneados`, lida direto pelo admin.js. Não escreve em `filmes`.

> ⚠️ Há DUAS implementações da Fase 3: o cron `sync-status.js` (server-side,
> roda às 6h UTC) e o botão **"Sincronizar"** do `admin.html` (client-side em
> `js/pages/admin.js`, que chama `a11y-sources.js`). Ao mudar a lógica de
> classificação, **alterar os dois** — eles não compartilham código.

**Opção A — Sync diário via apps (em desenvolvimento — desenvolvedor externo)**
Script Node.js (`scripts/sync-app-catalog.js`) que roda uma vez por dia via
Windows Task Scheduler na máquina do desenvolvedor:
1. Descobre APIs dos apps via interceptação de tráfego (BlueStacks + mitmproxy)
2. Chama APIs dos 5 apps em ordem: MovieReading → PingPlay → MLOAD → GRETA → Trio
   (1 filme = 1 app; quando encontrado no primeiro, para de buscar nos demais)
3. Faz match por título normalizado (Levenshtein + substring) com filmes `status=CARTAZ`
4. Grava sugestões em `film_app_suggestions` para o admin confirmar no painel
Complementa a FASE 3 do `sync-status` para apps sem fonte pública conhecida (GRETA, Trio, Conecta).
Ver prompt técnico completo gerado na sessão de 2026-05.

**`newsletter-weekly.js` — cron segunda 11h UTC (08h BRT)** (`schedule = "0 11 * * 1"`).
Pega em `filmes` os lançamentos com `ingresso_data.premiereDate` DESTA semana
(seg→dom) e `app_status=confirmado`, monta a lista (pôster do Ingresso + app +
badges AD/LSE/Libras + link)
e envia via Resend (batch de 100) a todos com `aceita_email=true`. Não envia se a
semana não tiver lançamentos. Usa **`SUPA_SERVICE_KEY`** (lê os inscritos — PII —
server-side) + `RESEND_API_KEY` + `WELCOME_FROM`/`WELCOME_REPLY_TO`.

**`contato.js`** — formulário de contato (`contato.html`). Recebe POST
`{nome, email, celular, mensagem, bot_field}`, valida + honeypot anti-spam, e
envia via **Resend** para `CONTACT_TO` (env var; **default
`cassio@etcfilmes.com.br`** — fase de teste) com `reply_to` = e-mail de quem
escreveu (a resposta vai direto à pessoa). Reusa `RESEND_API_KEY` e `WELCOME_FROM`.
⚠️ Entrega: o destino @etcfilmes.com.br pode reter e-mails do domínio remetente
novo em quarentena — conferir spam/quarentena no teste.

**`welcome.js`** — e-mail de boas-vindas via **Resend**. Acionada por **Database
Webhook do Supabase** no `INSERT` da tabela `newsletter` (só cadastro novo).
Respeita `aceita_email`; não envia WhatsApp (fase futura). Env vars no Netlify:
`RESEND_API_KEY`, `WELCOME_FROM` (remetente verificado @acessonatela.com),
`WELCOME_REPLY_TO` (opcional), `WELCOME_WEBHOOK_SECRET` (header `x-webhook-secret`).
Sempre retorna 200 (não derruba o webhook); erros vão pro log.

**`catalog.js` (Edge Function `/api/catalog`)** — cache do catálogo via Netlify
Blobs. Ativa e necessária.

**`ingresso.js` (Edge Function `/api/ingresso`)** — proxy obrigatório para a API
da Ingresso (contorna CORS).

---

## 8. Páginas — fluxos

### `index.html` — Home
`loadCatalog()` → `GET /filmes?status=ilike.cartaz&app_status=eq.confirmado&order=created_at.desc&limit=200`
→ cada card é montado de `ingresso_data` (poster/título/meta) em `film-card.js`
→ filtra por `_isThisWeek` → ordena (acessíveis primeiro) → `buildCard()`. A ordem de
exibição usa `/api/ingresso?type=nowplaying` (cacheado em localStorage). Grids
ficam vazios se o Supabase não retornar resultados (intencional, sem fallback
hardcoded). Newsletter: dois formulários (hero e seção) gravam via RPC
`upsert_subscriber` (tabela `newsletter`) + Netlify Forms.

### `filme.html` — Detalhe (produção)
Modos de URL: `?urlKey={url_key}` (principal), `?ingresso={eventId}`, `?film={legado}`.
`loadFilme(urlKey)` → `GET /filmes?url_key=eq.{urlKey}&limit=1` → chama
`getEventId(urlKey)` (objeto do evento Ingresso) → `_renderIngresso()` preenche
pôster (PosterPortrait), título original · ano (premiereDate.year) · país ·
distribuidora, pills (gênero · duração · classificação), sinopse e trailer.
`loadSessoes()` usa o proxy da Ingresso. **Comentários (Relatos da comunidade) estão dinâmicos e funcionando:**
`initComentarios()` lê `GET /comentarios?filme_url_key=eq.{urlKey}&order=created_at.desc&limit=50`;
`submitComentario()` valida o e-mail via RPC `email_cadastrado` (fallback: tabela
`newsletter`), atualiza o nome do usuário (`upsert_subscriber`) e faz
`supabasePost('comentarios', …)` com `email`/`subscriber_id`. Vazio renderiza "Nenhum relato ainda".
**Pôster:** montado como `background-image` na `div#fp-poster-box` — recebeu
`role="img"` + `aria-label` para leitores de tela (acessibilidade).

### `catalogo.html` — Streaming
`GET /filmes?status=ilike.catalogo` → TMDb `/movie/{id}` + `/watch/providers` BR →
chips de plataforma dinâmicos. Cards linkam para `catalogo-filme.html?urlKey=...`.
(Foco atual do time está nos filmes em cinema; catálogo em segundo plano.)

### `admin.html` — Painel
Cadastro: Título · URL Ingresso (extrai `url_key`) · App · Status · vídeos
acessíveis (YouTube IDs de trailer e de sinopse). AD/LSE/LIBRAS sempre marcados
(obrigatório por lei). Moderação de `comentarios`. Botão de **Sincronização
manual** (espelha as fases do `sync-status`; insere `film_{urlKey}` com `url_key`).
Login client-side (ver §2/§9).

---

## 9. Design system

```css
--laranja:#D4500F; --laranja-esc:#A83D0A; --laranja-cl:#FDF0EA; --laranja-bdr:#E8845A;
--ink:#1A1A1A; --ink2:#444; --ink3:#777; --bg:#FFF; --bg2:#F7F6F3; --bg3:#EDEBE6;
--ad:#005C2E;   /* Audiodescrição — verde escuro */
--lse:#003D8F;  /* Legenda p/ surdos — azul escuro */
--lib:#3D0070;  /* Libras — roxo */
--bdr:rgba(0,0,0,0.11); --r:14px; --r-sm:8px; --r-lg:20px;
```
Tipografia: Inter (400/500/600/700) + Fraunces (itálico, títulos). Barra de
acessibilidade: fundo `#1A1A1A`, padrão unificado em todas as páginas.

Login do admin: client-side (fraco). A senha não é guardada neste arquivo.

---

## 10. Acessibilidade implementada

Skip links (WCAG 2.4.1), `lang="pt-BR"` (3.1.1), foco visível outline laranja 3px
(2.4.7), `role`/`aria-label`/`aria-pressed` (4.1.2), `aria-live` (4.1.3), 4 modos
de contraste — original/alto/invertido/cinza (1.4.3), 3 níveis de fonte via
`font-lg`/`font-xl` (1.4.4), `.sr-only`, skeleton com `aria-hidden`, preferências
salvas em `localStorage` (com try/catch), VLibras oficial. Padrões: ABNT NBR
17225 + WCAG 2.2 AA.

---

## 11. Aplicativos de acessibilidade (6 apps)

Cards em `aplicativos.html` (modelo: logo 44×44 + nome + botões App Store/Google
Play + contato site + Instagram). Os 6 apps estão na página. Logos em
`/assets/app-*.png` (moviereading, mload, greta, pingplay, trio, conecta);
estilos de fundo em `components.css` (`.app-logo-mr/-ml/-greta/-pp/-trio/-conecta`).

| App | Recursos | Origem do vínculo filme↔app |
|---|---|---|
| MovieReading | AD · LSE · Libras | FASE 3 (CineAcessível) |
| MLOAD | AD · Libras | FASE 3 (GoMAV) |
| GRETA | LSE · AD | externo |
| PingPlay | AD · Cinema | FASE 3 |
| Trio Cinema | — | aplicação paralela |
| Conecta Acessibilidade | — | aplicação paralela |

**Modelo real: 1 filme = 1 app = todos os recursos (AD + LSE + Libras).**
O campo `filmes.app` armazena o app exclusivo do filme. A fonte de verdade é esse
campo no Supabase, não os badges de acessibilidade. A lógica de badge
("tem AD → MovieReading") era um fallback legado e não reflete o modelo atual —
não usar para inferir o app correto.

---

## 12. Estado e pendências (atualizado nesta revisão)

**Concluído / corrigido:**
- Home, detalhe (`filme.html`) e pipeline `sync-status` verificados ao vivo, sem
  erros de console próprios do site.
- Comentários dinâmicos: **feito** (não há mais hardcoded).
- Bug de CORS da Ingresso na home: **resolvido** — a home usa o proxy
  `/api/ingresso?type=nowplaying` (cacheado), não chamada direta.
- Pôster do detalhe: ganhou `role="img"` + `aria-label`.
- Apps: Trio Cinema e Conecta Acessibilidade adicionados em `aplicativos.html`
  (6 cards no total) + classes `.app-logo-trio`/`.app-logo-conecta` em
  `components.css` + logos `app-trio.png`/`app-conecta.png` em `/assets/`.
- **`sobre.html` criada** com conteúdo completo + `css/pages/sobre.css`.
  Adicionada ao nav e footer (entre FAQ e posição final). Renderiza via
  `renderHeader('sobre')` + `renderFooter()`.
- **Cinemas removido do nav e footer** — `cinemas.html` mantida no repo mas
  fora da navegação até a página ser finalizada.
- **Fix mobile "Fique por dentro"** — `css/pages/home.css` @media ≤640px:
  `font-size: 16px` nos `.cad-input` (evita zoom automático iOS Safari),
  `width: 100%` no `.cad-btn`, padding ajustado no `.hero-cadastro`.

**Aberto:**
- `aria-label` descritivo nos pôsteres dos **cards** (a melhoria acima foi no
  detalhe; revisar os cards).
- Deep links nos apps (hoje só links de store).
- Geolocalização (detectar cidade via `navigator.geolocation`).
- Decidir unificação `filme.html` vs `catalogo-filme.html`.
- Endurecer o login do admin (client-side).
- **Opção A** — script de sync diário dos apps via APIs interceptadas
  (desenvolvimento em andamento por pessoa externa). Depende: criar tabela
  `film_app_suggestions` no Supabase + seção de revisão no `admin.html`.
- **Cinemas** — página pausada; retomar quando arquitetura film-sessions-index
  for validada com os IDs de cidade corretos da Ingresso.

---

## 13. Convenções de trabalho para o Claude Code

- Tratar **o repositório como fonte da verdade**; documentações antigas podem
  estar desatualizadas. Verificar arquivos no `main` antes de depurar (regra 6).
- Editar os arquivos reais do repo; nada de framework/build (regra 1).
- Antes de mexer em detalhe de filme, confirmar se é `filme.html` ou
  `catalogo-filme.html` conforme a origem.
- Publicação (commit/push/deploy) acontece sob aprovação explícita do usuário no
  terminal. O Netlify publica sozinho ao chegar no `main`.
- Não commitar segredos. Chaves públicas ficam em `js/config.js`.
- Validar JS com `node --check` e equilíbrio de tags ao editar HTML.
