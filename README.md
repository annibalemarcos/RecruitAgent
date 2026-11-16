# RecruitAgent — Agente de recrutamento e candidaturas

Aplicativo local para organizar pesquisas de oportunidades e preparar candidaturas. Informe empresas ou sites, carregue um perfil profissional e deixe o app pesquisar páginas públicas, identificar vagas e localizar contatos publicados. Quando um provedor de IA está configurado, o RecruitAgent também pode analisar currículos e preparar materiais personalizados.

> **O RecruitAgent não envia candidaturas automaticamente.** Você revisa os contatos e os textos e decide se e quando vai enviá-los.

## Funcionalidades

- Importação de empresas por CSV ou por uma lista de sites.
- Pesquisa em páginas públicas para localizar páginas de carreira, vagas e contatos publicados.
- Registro da página de origem e das evidências usadas para confirmar endereços de email.
- Integração opcional com serviços externos de busca e leitura de páginas.
- Importação de currículo e preparação de emails, mensagens curtas e cartas em português e inglês com auxílio de IA.
- Pesquisa que pode ser pausada e retomada.
- Acompanhamento de contatos e vagas em áreas separadas.
- Exportação de resultados e materiais.
- Perfis reutilizáveis para evitar preencher as mesmas informações novamente.

O app diferencia a existência de um endereço de email da confirmação de que ele é um canal de recrutamento. Uma resposta de IA ou um trecho de resultado de busca, isoladamente, não é considerado prova do email.

## Requisitos

- Windows, macOS ou Linux.
- [Node.js 24 LTS](https://nodejs.org/) recomendado, com npm incluído.
- Chaves de API dos serviços que você pretende utilizar. Elas são opcionais para a coleta direta de páginas, mas necessárias para os recursos de IA e para os serviços externos correspondentes.

## Instalação

Clone o repositório e entre na pasta:

```bash
git clone https://github.com/annibalemarcos/RecruitAgent.git
cd RecruitAgent
npm ci
```

## Execução

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

Depois, abra [http://localhost:3000](http://localhost:3000).

No Windows, você também pode iniciar o aplicativo por `iniciar.bat`. O script verifica o Node.js, instala dependências se necessário e abre o navegador. `start.bat` chama o mesmo inicializador.

Para encerrar o servidor iniciado no terminal, pressione `Ctrl+C`.

## Configuração das APIs

As chaves podem ser armazenadas no arquivo local `.env` ou informadas em **Configurações** no aplicativo. O arquivo `.env.example` é apenas um modelo, com campos vazios.

Crie seu `.env` a partir do modelo:

**PowerShell (Windows):**

```powershell
Copy-Item .env.example .env
```

**macOS/Linux:**

```bash
cp .env.example .env
```

Abra `.env` em um editor e preencha somente as chaves dos provedores que pretende utilizar. Reinicie o servidor depois de alterar esse arquivo. Na interface, um campo de chave vazio utiliza o valor correspondente do `.env`.

### Provedores disponíveis

| Serviço | Uso no app | Variável no `.env` |
| --- | --- | --- |
| Google Gemini | Análise de currículos e geração de materiais com IA | `GEMINI_API_KEY` |
| OpenAI | Provedor alternativo de IA | `OPENAI_API_KEY` |
| Perplexity | Provedor alternativo de IA e busca web | `PERPLEXITY_API_KEY` |
| OpenRouter | Acesso a modelos de IA compatíveis | `OPENROUTER_API_KEY` |
| Brave Search | Busca de páginas para complementar a pesquisa | `BRAVE_SEARCH_API_KEY` |
| You.com | Busca e leitura de páginas | `YOU_API_KEY` |
| Exa | Busca semântica de páginas | `EXA_API_KEY` |
| Firecrawl | Leitura de páginas que exigem processamento adicional | `FIRECRAWL_API_KEY` |

O Google Gemini também aceita `GOOGLE_API_KEY`; You.com aceita `YDC_API_KEY` como alternativa a `YOU_API_KEY`.

As chaves não são fornecidas com o projeto. Consulte os sites dos provedores para criar uma conta e verificar preços, cotas e condições de uso.

### Estratégia de fallback

- **Busca de sites:** Brave Search, You.com e Exa. A ordem pode ser configurada; provedores sem chave são ignorados.
- **Leitura de páginas:** o app tenta acessar o site diretamente e pode recorrer a Firecrawl ou You.com Contents quando configurados.
- **IA:** o provedor escolhido fica em primeiro lugar; outros provedores configurados podem ser tentados se houver falha ou resposta inutilizável.

Em **Configurações → Pesquisa & IA**, você pode escolher provedores e modelos, ajustar limites e testar integrações. Os testes fazem chamadas reais aos serviços e podem consumir créditos.

## Como usar

### 1. Prepare a lista de empresas

Na tela de entrada, carregue um CSV ou cole os sites manualmente. Um CSV pode usar cabeçalho e colunas para nome e endereço do site. Exemplo:

```csv
empresa;site
Empresa Exemplo;https://example.com
Outra Empresa;https://example.org
```

O app tenta identificar automaticamente as colunas de nome e URL. Confira a prévia antes de iniciar a pesquisa. Também é possível carregar os dados fictícios pelo botão **Dados de Exemplo**.

### 2. Informe o perfil do candidato

Preencha o perfil manualmente ou importe um currículo (`.pdf`, `.docx` ou `.txt`). Também é possível carregar um perfil JSON compatível. O repositório inclui `perfil_candidato_exemplo.json` como arquivo de exemplo; substitua os dados fictícios pelos seus próprios dados somente em uma cópia local.

Revise as informações extraídas antes de utilizá-las em materiais de candidatura. Um perfil mais completo — experiência, competências, idiomas, links profissionais e preferências — ajuda a IA a produzir textos mais úteis. Ainda assim, revise todos os resultados.

### 3. Ajuste a pesquisa e inicie

Em **Configurações**, escolha os provedores de busca e IA, configure limites de páginas, concorrência e tempo de espera e defina se deseja materiais em dois idiomas. Salve as alterações e clique em **Iniciar Pesquisa**.

A pesquisa pode ser pausada e retomada. O progresso é salvo localmente para que você possa alternar entre diferentes lotes.

### 4. Revise os resultados

Nos painéis de contatos e vagas, confira a classificação, a fonte e a evidência. Endereços publicados podem pertencer ao recrutamento, ao contato geral ou a outro departamento; a classificação não garante que o destinatário aceite candidaturas.

Os materiais gerados ficam editáveis. Você pode revisar, copiar, baixar ou abrir um rascunho de email no Gmail quando essa opção estiver disponível. **O envio continua sob seu controle.**

### 5. Acompanhe e exporte

Use o CRM para marcar contatos como pendentes, enviados/contactados ou descartados e acompanhar respostas e entrevistas. A tela de exportação oferece resultados e materiais em formatos como CSV, TXT e ZIP, conforme o painel.

## Dados locais e arquivos ignorados pelo Git

O aplicativo grava dados de uso localmente na pasta do projeto:

- `data/` — sessões de pesquisa, contatos, vagas, materiais, histórico e configurações gerais.
- `saved-profiles/` — perfis reutilizáveis salvos localmente.
- `master-backups/` — backups locais.
- `.env` — chaves de API configuradas manualmente.

Esses dados não são necessários para instalar o projeto. O `.gitignore` exclui dados de execução, backups, arquivos de configuração locais, credenciais e documentos pessoais do controle de versão.

O arquivo `perfil_candidato_exemplo.json` é mantido no repositório como exemplo. Arquivos pessoais que correspondam ao padrão `perfil*.json` são ignorados pelo Git, com exceção desse arquivo de exemplo.

Arquivos CSV locais na raiz também são ignorados. Se você precisar compartilhar um conjunto de dados de demonstração, prepare uma versão fictícia e revise seu conteúdo antes de adicioná-la intencionalmente ao repositório.

O botão **Apagar dados** remove o conteúdo de `data/`, inclusive sessões, contatos, materiais e acompanhamento. Ele não remove `saved-profiles/` nem `.env`. A ação é permanente; exporte o que quiser guardar antes de confirmar. Consulte [RESET_DADOS.md](RESET_DADOS.md) para os detalhes.

## Privacidade e segurança

O app roda localmente, mas **não possui autenticação**. O servidor está configurado para aceitar conexões pelas interfaces de rede da máquina. Use-o em um dispositivo e rede confiáveis; não o publique como serviço acessível pela internet nem em uma rede compartilhada sem adicionar controles de acesso.

O conteúdo do currículo e do perfil é enviado ao provedor de IA selecionado quando você solicita análise ou geração de materiais. Consultas de busca e URLs também podem ser enviadas aos serviços externos configurados. Verifique as políticas de privacidade desses provedores antes de inserir dados pessoais ou confidenciais.

**Nunca coloque chaves de API em código, issues, commits ou arquivos públicos.** Não envie `.env`, `chaves-apis.json`, perfis pessoais, sessões ou backups ao GitHub. Se uma chave for publicada por engano, revogue-a no provedor e gere outra. Remover o arquivo em um commit posterior não apaga o histórico do Git.

Antes de publicar alterações, confira os arquivos preparados para commit:

```bash
git status
git diff --cached --stat
```

O `.gitignore` evita que arquivos ainda não rastreados sejam adicionados por engano, mas não remove automaticamente arquivos que já estejam sendo rastreados pelo Git.

## Comandos úteis

```bash
npm run dev        # iniciar o servidor de desenvolvimento
npm start          # iniciar o servidor
npm run build      # gerar a interface de produção em dist/
npm test           # executar a suíte principal de testes
npm run test:reset # testar a limpeza em dados temporários
npm run lint       # verificar tipos TypeScript
```

O teste de vagas pode ser executado separadamente:

```bash
node --import tsx tests/test-vacancies.ts
```

O comando `npm run lint` executa o compilador TypeScript sem gerar arquivos. Algumas limitações conhecidas podem estar descritas em [ALTERACOES.md](ALTERACOES.md).

## Solução de problemas

**A página não abre:** confirme que o servidor continua ativo no terminal e tente `http://localhost:3000`. Se a porta estiver ocupada, encerre o outro processo ou escolha outra porta ao iniciar.

PowerShell:

```powershell
$env:PORT = "3001"; npm run dev
```

macOS/Linux:

```bash
PORT=3001 npm run dev
```

**A análise de currículo ou geração de materiais falha:** confira se existe uma chave válida para um provedor de IA, se o modelo está disponível e se a conta tem cota ou créditos. Use **Testar conexão** em Configurações e consulte os logs da execução.

**Não foram encontrados emails:** o site pode não publicar um endereço verificável, pode bloquear a leitura ou os provedores de busca podem não estar configurados. O app não inventa endereços para preencher resultados.

**O CSV foi lido incorretamente:** inclua cabeçalhos com nome da empresa e site, use vírgulas, ponto e vírgula ou tabulações e confira a prévia e as colunas selecionadas.

## Estrutura do projeto

Visão geral dos diretórios e arquivos principais:

```text
RecruitAgent/
├── data/                 # dados locais de execução (ignorada pelo Git)
├── master-backups/       # backups locais (ignorados pelo Git)
├── saved-profiles/       # perfis locais (ignorada pelo Git)
├── server/               # módulos do servidor
├── src/                  # código-fonte da interface
│   ├── components/
│   ├── types/
│   ├── utils/
│   └── index.css
├── tests/                # testes
├── .env.example          # modelo de configuração
├── .gitignore
├── ALTERACOES.md         # histórico de alterações
├── package.json
├── README.md
├── RESET_DADOS.md
├── SECURITY.md
├── iniciar.bat           # inicializador para Windows
├── start.bat             # atalho para o inicializador
└── tsconfig.json
```

## Documentação adicional

- [ALTERACOES.md](ALTERACOES.md) — histórico de recursos e ajustes.
- [RESET_DADOS.md](RESET_DADOS.md) — comportamento da limpeza de dados.
- [SECURITY.md](SECURITY.md) — cuidados de segurança e como reportar vulnerabilidades.
