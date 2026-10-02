# RASTRO — registro de ordens de serviço

Node (Express) + React (Vite) + **Postgres** (Supabase) + imagens no **Supabase Storage**. Hospedagem: **Render** (grátis).

## Colocar no ar (100% gratuito)

### 1. Supabase (banco + imagens)
1. Crie conta em supabase.com → **New project** (região South America). Anote a senha do banco.
2. **Connect** (botão no topo) → aba **Session pooler** → copie a string `postgresql://…` e troque `[YOUR-PASSWORD]` pela senha. Esta é a `DATABASE_URL`.
   (Use o *Session pooler*, não a conexão direta: o Render grátis só fala IPv4.)
3. **Project Settings → API**: copie a **Project URL** (`SUPABASE_URL`) e a chave **service_role** (`SUPABASE_SERVICE_KEY`; em "Legacy API keys" se necessário). Essa chave é secreta.
4. O bucket de imagens (`os-fotos`) é criado sozinho pelo sistema.

### 2. GitHub
Crie um repositório **privado** e envie esta pasta (o `.gitignore` já exclui o que não deve subir).

### 3. Render
1. render.com → **New → Blueprint** → escolha o repositório (usa o `render.yaml`).
2. Preencha as variáveis: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` e, se quiser, `SUPER_EMAIL` / `SUPER_PASSWORD` (seu login de dono).
3. Deploy. A URL `https://rastro.onrender.com` abre o sistema. Sem `SUPER_*`, o login inicial é `dono@sistema.local` / `trocar123` (troca obrigatória).

> Limites do plano grátis: o Render "dorme" após ~15 min sem uso (o 1º acesso demora ~30–60 s); o Supabase pausa projetos após 1 semana sem nenhuma atividade (basta reativar no painel). Para evitar, um monitor gratuito (UptimeRobot) chamando `/api/health` a cada 10 min mantém tudo acordado.

## Rodar no seu computador
```bash
npm run setup
# crie server/.env com base em server/.env.example (ou defina as variáveis no terminal)
npm start          # http://localhost:3001
```
Sem `SUPABASE_*`, as imagens ficam em `server/data/uploads` (só para teste local).
Desenvolvimento: `npm run dev:server` e `npm run dev:client` (front em :5173).

## Perfis
| Perfil | O que faz |
|---|---|
| **Dono** | Cadastra empresas (CNPJ, telefone, endereço por CEP, limite de funcionários), ativa/desativa, redefine senha. |
| **ADM** da empresa | Cria funcionários (até o limite), vê todas as OSs da empresa, cria/edita/exclui. |
| **Funcionário** | Cria OSs e vê só as dele. |

Toda senha provisória obriga a troca no primeiro login. PDF: botão **Imprimir / Salvar PDF** na OS.
