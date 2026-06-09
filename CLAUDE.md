# Acesso na Tela — Contexto do Projeto (CLAUDE.md)

Portal brasileiro de filmes acessíveis (AD, LSE, Libras) para pessoas com
deficiência visual, auditiva e surdocegueira. Iniciativa da ETC Filmes.

> Este arquivo é lido automaticamente pelo Claude Code a cada sessão. Ele é a
> fonte de contexto do projeto. **Não inclua segredos aqui** (senha do admin,
> chaves privadas) — este arquivo é versionado num repositório público.
>
> Última revisão: atualizado na sessão pós-commit `61619db` — inclui página Sobre,
> remoção de Cinemas do nav, fix mobile do hero-cadastro e planejamento da Opção A.
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
| API de filmes | TMDb (`https://api.themoviedb.org/3`) |
| API de sessões | Ingresso.com via Edge Function proxy |
| Banco de dados | Supabase REST (chamado direto do browser) |
| Libras | VLibras — widget oficial do Governo Federal |
| Fontes | Google Fonts: Inter + Fraunces |
| Imagens TMDb | `https://image.tmdb.org/t/p/w300{poster_path}` |

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
tmdb_id      int
tmdb_data    jsonb       → dados cacheados do TMDb (poster, sinopse, etc.)
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

### Outras tabelas
```
newsletter_subscribers  → id uuid, nome, email (unique), celular, prefs jsonb, subscribed_at
comentarios             → id uuid, filme_url_key, autor, texto, cinema, aprovado bool, created_at

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
- `newsletter_subscribers`: inserção pública.
- `comentarios`: leitura só de aprovados (`aprovado = true`), inserção pública.

---

## 6. Integrações externas

**TMDb** — base `https://api.themoviedb.org/3`, auth `Authorization: Bearer {TOKEN}`
(token em `config.js`). Endpoints: `GET /movie/{id}?language=pt-BR&append_to_response=credits,release_dates,videos`,
`GET /movie/{id}/watch/providers`, `GET /search/movie?query={titulo}&language=pt-BR&region=BR`.
Importante: **a home e o catálogo renderizam a partir do `tmdb_data` cacheado no
Supabase**; chamada ao vivo ao TMDb é só fallback. O `sync-status` mantém o cache.

**Ingresso.com** — partnership `locomotivadigital`. Proxy `/api/ingresso`:
- `?urlKey={urlKey}` → `eventId` + título
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
Segue a lógica de produto pretendida, nesta ordem:
1. **FASE 1 — Ingresso:** descobre filmes em cartaz; insere novos como
   `id: film_{urlKey}`, com `url_key`, `status` CARTAZ/BREVE (via `isComingSoon`)
   e `app_status: pendente`. Verifica sessões na semana: filme em CARTAZ sem
   sessão → rebaixado para CATALOGO (sai da home).
2. **FASE 2 — TMDb:** enriquece quem está sem `tmdb_data` (pôster, sinopse,
   gênero, data). Não descarta filmes não encontrados.
3. **FASE 3 — Apps:** cruza filmes `pendente` com as fontes dos fornecedores
   (MovieReading/CineAcessível, MLOAD/GoMAV, PingPlay) e promove para
   `app_status: confirmado`. Observação: FASE 3 **não** auto-classifica GRETA,
   Trio Cinema nem Conecta — esses vínculos vêm da aplicação paralela.

> A lógica de produto: Ingresso (passo 1, dá o `url_key`) → filtra por sessões na
> semana (passo 2) → TMDb (passo 3) → checa apps (passo 4). **Só filmes com algum
> app seguem na home, e como vieram da Ingresso, todos têm `url_key` e são
> clicáveis.** O passo 4 ENRIQUECE filmes existentes; não cria filmes a partir
> dos apps.

**`a11y-sources.js`** — function que apenas LÊ as fontes dos fornecedores
(MovieReading, MLOAD, PingPlay) e retorna `{titles, details}` para a FASE 3
cruzar. Não escreve em `filmes`.

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

**`catalog.js` (Edge Function `/api/catalog`)** — cache do catálogo via Netlify
Blobs. Ativa e necessária.

**`ingresso.js` (Edge Function `/api/ingresso`)** — proxy obrigatório para a API
da Ingresso (contorna CORS).

---

## 8. Páginas — fluxos

### `index.html` — Home
`loadCatalog()` → `GET /filmes?status=ilike.cartaz&app_status=eq.confirmado&order=created_at.desc&limit=200`
→ para cada filme usa `tmdb_data` cacheado (fallback `getMovie`) → filtra por
`_isThisWeek` → ordena (acessíveis primeiro) → `buildCard()`. A ordem de
exibição usa `/api/ingresso?type=nowplaying` (cacheado em localStorage). Grids
ficam vazios se o Supabase não retornar resultados (intencional, sem fallback
hardcoded). Newsletter: dois formulários (hero e seção), salvam em
`newsletter_subscribers` + Netlify Forms.

### `filme.html` — Detalhe (produção)
Modos de URL: `?urlKey={url_key}` (principal), `?ingresso={eventId}`, `?film={legado}`.
`loadFilme(urlKey)` → `GET /filmes?url_key=eq.{urlKey}&limit=1` → se tem `tmdb_id`
usa TMDb/`watch/providers` → `_renderTmdb()`. `loadSessoes()` usa o proxy da
Ingresso. **Comentários (Relatos da comunidade) estão dinâmicos e funcionando:**
`initComentarios()` lê `GET /comentarios?filme_url_key=eq.{urlKey}&order=created_at.desc&limit=50`;
`submitComentario()` valida o e-mail contra `newsletter_subscribers` e faz
`supabasePost('comentarios', …)`. Vazio renderiza "Nenhum relato ainda".
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
