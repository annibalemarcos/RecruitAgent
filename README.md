# RecruitAgent — Agente de recrutamento e candidaturas

Aplicativo local para organizar pesquisas de oportunidades e preparar candidaturas. Informe empresas ou sites, carregue um perfil profissional e deixe o app pesquisar páginas públicas, identificar vagas e procurar contatos publicados. Quando há um provedor de IA configurado, ele também pode analisar currículos e gerar materiais personalizados.

O RecruitAgent **não envia candidaturas automaticamente**. Você revisa os contatos e os textos e decide se e quando vai enviá-los.

## O que ele faz

- Recebe empresas por arquivo CSV ou por uma lista de sites.
- Percorre páginas de cada site para localizar páginas de carreira, vagas e contatos publicados.
- Registra a página de origem e a evidência usada para confirmar cada endereço de email.
- Pode consultar serviços externos de busca e leitura de páginas quando essas integrações estão configuradas.
- Extrai informações de um currículo e ajuda a preparar emails, mensagens curtas e cartas em português e inglês.
- Permite pausar e retomar pesquisas, acompanhar contatos e vagas em seções separadas e exportar resultados.
- Salva perfis reutilizáveis para evitar preencher as mesmas informações novamente.

O app distingue a existência de um endereço de email da confirmação de que ele é um canal de recrutamento. Uma resposta de IA ou um trecho de resultado de busca, por si só, não é considerado prova do email.

## Requisitos

- Windows, macOS ou Linux.
- [Node.js 24 LTS](https://nodejs.org/) recomendado, com npm incluído.
- Chaves de API dos serviços que você pretende usar. Elas são opcionais para a coleta direta de páginas; são necessárias para os recursos de IA e para os serviços externos correspondentes.

## Instalação e execução

Clone o repositório e entre na pasta:

```sh
git clone <URL-DO-REPOSITORIO>
cd agente-de-recrutamento-candidaturas
npm ci
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

No Windows, também é possível iniciar com `iniciar.bat`. O script verifica o Node.js, instala dependências se necessário e abre o navegador. `start.bat` chama o mesmo inicializador.

Para parar o servidor iniciado no terminal, pressione `Ctrl+C`.

## Configuração das APIs

Você pode guardar as chaves no arquivo `.env` ou informá-las em **Configurações** no app. O `.env.example` é um modelo com campos vazios. Para criar o arquivo local:

**PowerShell (Windows):**

```powershell
Copy-Item .env.example .env
```

**macOS/Linux:**

```sh
cp .env.example .env
```

Abra `.env` em um editor e preencha apenas as chaves dos provedores que pretende usar. Reinicie o servidor depois de alterar esse arquivo. Na interface, um campo de chave vazio usa o valor correspondente do `.env`.

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

As chaves não são fornecidas com o projeto. Consulte os sites dos provedores para criar uma conta, obter uma chave e verificar preços, cotas e condições atuais.

### Como os fallbacks funcionam

- **Busca de sites:** Brave Search, You.com e Exa. A ordem pode ser configurada; provedores sem chave são ignorados.
- **Leitura de páginas:** o app tenta acessar o site diretamente e pode recorrer a Firecrawl ou You.com Contents quando configurados.
- **IA:** o provedor escolhido fica em primeiro lugar; os demais provedores configurados podem ser tentados se houver falha ou resposta inutilizável.

No app, use **Configurações → Pesquisa & IA** para escolher provedores e modelos, ajustar limites e testar integrações. Os botões de teste fazem chamadas reais aos serviços e podem consumir créditos.

## Como usar

### 1. Prepare a lista de empresas

Na tela de entrada, carregue um CSV ou cole os sites manualmente. Para CSV, use uma linha de cabeçalho e colunas para nome e endereço do site, por exemplo:

```csv
empresa;site
Empresa Exemplo;https://example.com
Outra Empresa;https://example.org
```

O app tenta identificar automaticamente as colunas de nome e URL. Confira a prévia antes de iniciar a pesquisa. Também é possível carregar os dados fictícios pelo botão **Dados de Exemplo**.

### 2. Informe o perfil do candidato

Preencha o perfil manualmente ou importe um arquivo de currículo (`.pdf`, `.docx` ou `.txt`). Também é possível carregar um perfil JSON compatível. Revise as informações extraídas antes de usá-las em materiais de candidatura.

Um perfil mais completo — experiência, competências, idiomas, links profissionais e preferências — ajuda a IA a produzir textos mais úteis. A geração é limitada às informações fornecidas no perfil e às informações disponíveis sobre a empresa; ainda assim, revise todos os resultados.

### 3. Ajuste a pesquisa e inicie

Em **Configurações**, escolha os provedores de busca e IA, configure os limites de páginas, concorrência e tempo de espera, e defina se deseja materiais em dois idiomas. Salve as alterações e clique em **Iniciar Pesquisa**.

A pesquisa pode ser pausada e retomada. O progresso é salvo em seções para que você possa alternar entre diferentes lotes.

### 4. Revise os resultados

Nos painéis de contatos e vagas, confira a classificação, a fonte e a evidência. Endereços publicados podem ser de recrutamento, contato geral ou outro departamento; a classificação não garante que o destinatário aceite candidaturas.

Materiais gerados ficam editáveis. Você pode revisar, copiar, baixar ou abrir um rascunho de email no Gmail quando essa opção estiver disponível. **O envio continua sob seu controle.**

### 5. Acompanhe e exporte

Use o CRM para marcar contatos como pendentes, enviados/contactados ou descartados e para acompanhar respostas e entrevistas. A tela de exportação oferece os resultados e materiais disponíveis em formatos como CSV, TXT e ZIP, dependendo do painel.

## Perfis salvos, sessões e armazenamento

O servidor grava os dados localmente na pasta do projeto:

- `data/` — sessões de pesquisa, contatos, vagas, materiais e histórico de acompanhamento.
- `data/global_settings.json` — configurações gerais salvas pelo app.
- `saved-profiles/` — até dois perfis reutilizáveis, que podem incluir dados do candidato e configurações.
- `.env` — chaves configuradas manualmente no ambiente.

Esses arquivos são locais e não são necessários para instalar o projeto. O `.gitignore` os exclui do Git. Perfis exportados e backups de configurações podem conter dados pessoais ou chaves em texto aberto; guarde-os em local privado.

O botão **Apagar dados** remove o conteúdo de `data/`, inclusive sessões, contatos, materiais e acompanhamento. Ele não remove `saved-profiles/` nem `.env`. Essa ação é permanente; exporte o que quiser guardar antes de confirmar. Consulte [RESET_DADOS.md](RESET_DADOS.md) para os detalhes.

## Privacidade e segurança

O app roda localmente, mas **não possui autenticação**. O servidor está configurado para aceitar conexões pelas interfaces de rede da máquina. Use-o em um dispositivo e rede confiáveis; não o publique como serviço acessível pela internet nem em uma rede compartilhada sem adicionar controles de acesso.

O conteúdo do currículo e do perfil é enviado ao provedor de IA selecionado quando você pede análise ou geração de materiais. Consultas de busca e URLs também podem ser enviadas aos serviços externos que você configurou. Verifique as políticas de privacidade desses provedores antes de inserir dados pessoais ou confidenciais.

Nunca coloque chaves em código, issues, commits ou arquivos públicos. Se uma chave for publicada por engano, revogue-a no provedor e gere outra: remover o arquivo em um commit posterior não apaga o histórico do Git.

## Comandos úteis

```sh
npm run dev       # iniciar o servidor de desenvolvimento
npm start         # iniciar o servidor
npm run build     # gerar a interface de produção em dist/
npm test          # executar a suíte principal de testes
npm run test:reset # testar a limpeza em dados temporários
npm run lint      # verificar tipos TypeScript
```

O teste de vagas pode ser executado separadamente:

```sh
node --import tsx tests/test-vacancies.ts
```

O comando `npm run lint` executa o compilador TypeScript sem gerar arquivos. Algumas limitações conhecidas podem estar descritas em [ALTERACOES.md](ALTERACOES.md).

## Solução de problemas

**A página não abre:** confirme que o servidor continua ativo no terminal e tente `http://localhost:3000`. Se a porta estiver ocupada, encerre o outro processo ou escolha outra porta ao iniciar:

```powershell
# PowerShell
$env:PORT = "3001"; npm run dev
```

```sh
# macOS/Linux
PORT=3001 npm run dev
```

**A análise de currículo ou geração de materiais falha:** confira se há uma chave válida para um provedor de IA, se o modelo está disponível e se a conta tem cota/créditos. Use **Testar conexão** em Configurações e veja os logs da execução.

**Não foram encontrados emails:** isso pode significar que o site não publica um endereço verificável, que bloqueou a leitura ou que os provedores de busca não estão configurados. O app não inventa endereços para preencher o resultado.

**O CSV foi lido incorretamente:** inclua cabeçalhos com nome da empresa e site, use vírgulas, ponto e vírgula ou tabulações, e confira a prévia e as colunas selecionadas.

## Estrutura do projeto

```text
server.ts                 Servidor Express e rotas da API
server/                   Pesquisa, leitura, verificação, IA e persistência
src/App.tsx                Interface principal em React
src/components/            Telas, formulários e painéis
src/types/                 Tipos compartilhados entre interface e servidor
tests/                     Testes automatizados
data/                      Dados locais gerados durante o uso (ignorada pelo Git)
saved-profiles/            Perfis locais (ignorada pelo Git)
```

## Documentação adicional

- [ALTERACOES.md](ALTERACOES.md) — histórico de recursos e ajustes.
- [RESET_DADOS.md](RESET_DADOS.md) — comportamento da limpeza de dados.
- [SECURITY.md](SECURITY.md) — cuidados de segurança e como reportar vulnerabilidades.

