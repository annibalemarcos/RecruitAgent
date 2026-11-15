# Alterações — Perfis salvos (Salvar Perfil)

Dois botões novos no cabeçalho: **Salvar Perfil** e **Meus Perfis**. Servem pra não recarregar tudo a cada abertura do app.

- **Salvar Perfil** abre um modal onde você escolhe o slot (até **2 perfis**), dá um nome e marca os blocos:
  1. Carregar Empresas (CSV ou URLs)
  2. Perfil do Candidato & Fatos do Currículo (inclui os textos dos currículos PT/EN)
  3. Configurações de Pesquisa & IA — com a opção de incluir ou não as **chaves de API**
- **Meus Perfis**: carregar (escolhendo de novo quais blocos aplicar), renomear, excluir, **exportar .json** e **importar .json**. A importação também aceita um `config.json`/`chaves-apis.json` ou um `perfil_candidato.json` antigos (viram perfis só de configurações ou só de candidato).
- Onde ficam: pasta `saved-profiles/` na raiz do app (`perfil-1.json`, `perfil-2.json`), **fora de `data/`**, então o "Apagar dados" não apaga os perfis. Ao trocar de pasta/versão do app, leve essa pasta junto (ou exporte os perfis).
- Segurança: perfis com chaves de API guardam as chaves em **texto aberto**, igual ao config.json. Não compartilhe esses arquivos.
- Correção junto: a prévia de empresas do `CsvUploader` agora acompanha a lista quando ela muda por fora (perfil carregado, dados de exemplo).
- Arquivos: `src/savedProfiles.ts` (novo), `src/components/SavedProfilesModal.tsx` (novo), `src/components/Header.tsx`, `src/components/CsvUploader.tsx`, `src/App.tsx`, `src/apiCredentialsJson.ts`, `server.ts` (rotas `/api/saved-profiles`), `tests/test-saved-profiles.ts` (novo), `package.json` (`npm run test:profiles`).

---

# Alterações — Língua Padrão do "Visualizar"

Nova opção em **Configurações → Língua Padrão** (`PT-BR` ou `Inglês`). Ela só define qual idioma já vem selecionado no seletor **Visualizar**; o app continua em português.

- Aplica-se a: Contatos e Materiais (dashboard "Materiais Gerados"), gaveta de materiais por contato, janela de visualização/edição de materiais e painel de exportação.
- Você ainda pode trocar o idioma na hora; a escolha manual vale até recarregar ou mudar de tela.
- Persistência: vai em `settings.defaultViewLanguage` no **config.json** (exportar/importar JSON), na sessão salva no servidor e no **perfil** (`perfil_candidato.json`, campo `defaultViewLanguage`). Prioridade: Configurações → Perfil → PT-BR.
- Arquivos: `src/utils/viewLanguage.ts` (novo), `src/types/index.ts`, `src/apiCredentialsJson.ts`, `src/components/SettingsModal.tsx`, `ResultsDashboard.tsx`, `ContactsTable.tsx`, `ExportPanel.tsx`, `MaterialModal.tsx`, `ProfileEditor.tsx`, `src/App.tsx`, `server.ts`, `tests/test-config-json.ts`.

---

# Alterações — coleta comprovada e APIs com fallback

## Resumo

Esta versão mantém a correção da coleta de emails e adiciona as cinco APIs priorizadas: Brave Search, Firecrawl, You.com, Exa e OpenRouter. A integração é funcional no backend e na tela de configurações, não apenas um conjunto de campos ou prompts.

- `.env` e `.env.example` incluem as novas variáveis; nenhuma chave real é entregue.
- Interface: campos de chave protegidos, modelo OpenRouter, teste individual e botão para testar as cinco novas APIs; resultado/erro e latência; contagem de chamadas/falhas da execução do servidor; prioridades, ativação/desativação e limites.
- Backend: resolução interface → `.env`; alias `YDC_API_KEY`; timeout, cancelamento, respostas de erro controladas sem expor credenciais, fallback e suspensão temporária por credencial.
- Busca web agora acontece antes da busca assistida pelos modelos quando a coleta direta não encontra contatos. Snippets e emails sugeridos são descartados; cada URL candidata passa pelo verificador de fontes.
- OpenRouter integra a busca assistida, a geração de materiais e a análise de currículo, com a mesma prioridade/fallback dos provedores existentes.

## Filas de fallback

| Função | Ordem padrão | Quando avança |
| --- | --- | --- |
| Busca de URLs | Brave → You.com → Exa | Falha, quota, resultado vazio ou nenhum email confirmado nas páginas pesquisadas |
| Leitura de páginas | HTTP direto → Firecrawl → You.com Contents | Falha de acesso; opcionalmente também HTML sem email, para tentar conteúdo renderizado |
| IA | Gemini → OpenAI → Perplexity → OpenRouter | Falha ou resposta inútil; o provedor escolhido na interface vai primeiro |

Somente serviços com chave configurada participam. Os serviços têm funções diferentes: Firecrawl não substitui um modelo de geração, e OpenRouter não transforma uma resposta de IA em prova de email. Se a fila inteira falhar, não se cria contato para completar o resultado; materiais ficam pendentes.

As novas APIs de busca/leitura compartilham um limite por empresa (padrão: 12 chamadas), além de cache de páginas restrito à pesquisa daquela empresa. Geração de materiais, IA assistida e testes manuais não entram nesse limite. Cada requisição HTTP é contada como uma chamada, não como um crédito: o preço/créditos dependem do fornecedor.

Falhas HTTP 401/402/403/429 nas novas integrações suspendem aquela credencial por cinco minutos; falhas de transporte/JSON por 30 segundos. Uma chave diferente não herda o bloqueio. Testes manuais podem recuperar o circuito. Circuitos existentes de Gemini/OpenAI/Perplexity e o circuito de IA do OpenRouter também podem ser reabertos ao testar/salvar configurações. Salvar configurações da sessão reinicia os circuitos das novas APIs.

## Garantias da coleta mantidas

- Somente endereços completos publicados em texto de página ou `mailto:`.
- Não construir emails pelo domínio, não reconstruir ofuscações, não aceitar memória ou evidências escritas pelo modelo.
- Fontes no site informado ou fontes externas com link exato encontrado em página oficial efetivamente acessada.
- URLs de origem, trechos de evidência, método (`page-text` / `mailto`), data e provedor de leitura quando disponível.
- Firecrawl solicita HTML completo (`onlyMainContent: false`) e coleta fresca (`maxAge: 0`), mantendo rodapés e links; exige metadados de URL/status 2xx. You.com usa Contents em HTML, com `max_age: 0`; não usa Answer como comprovação.
- Páginas de erro não geram contatos. Sem resultado: `Email não encontrado`; falhas que impedem confirmar a fonte: `Não foi possível verificar a fonte`.
- Checkpoints, acompanhamento e caches não consideram metadados importados como prova. Ao restaurar, o backend confirma a página antes de aceitar contatos sem prova deste processo.
- Lista de contatos antiga não é incorporada automaticamente a uma nova pesquisa. Materiais anteriores podem ser preservados quando o endereço é confirmado novamente.
- Finalidade de recrutamento é uma classificação separada da existência do endereço.

Não houve redesenho do restante da aplicação nem migração em lote de contatos históricos. Os dados fornecidos foram preservados, retirando somente credenciais e sessões temporárias de testes preexistentes na primeira correção. Os JSONs antigos podem conter registros não comprovados; não são tratados como contatos verificados pela restauração.

## Arquivos modificados/adicionados nesta etapa

- `server/integrations.ts` — adaptadores, credenciais, limites, circuitos, contadores e testes.
- `server/pageAccess.ts` — leitura direta e fallback por APIs.
- `server/webSearchEnhancer.ts` — cascata de busca com comprovação de fontes.
- `server/extractor.ts` e `server/emailVerification.ts` — conectam a coleta/verificação à leitura e ao contexto da empresa.
- `server/aiSearchEnhancer.ts` — integra busca web e OpenRouter.
- `server/credentials.ts` — resolução/circuito OpenRouter.
- `server/materialsGenerator.ts` — materiais com OpenRouter/fallback.
- `server/documentParser.ts` — análise do currículo com todos os modelos configurados.
- `server/jobRunner.ts` — contexto de pesquisa, limite, logs e nova fila de IA.
- `server.ts` — teste dos cinco provedores e status sem expor chaves.
- `src/types/index.ts` — novas configurações e identificação do provedor.
- `src/components/IntegrationSettings.tsx` — novos campos/testes/limites.
- `src/components/SettingsModal.tsx` — inclui integrações e prioridade OpenRouter.
- `.env`, `.env.example` — configurações sem credenciais reais.
- `tests/test-integrations.ts`, `package.json` — testes e comandos.
- `README.md`, `ALTERACOES.md`, `iniciar.bat` — execução/documentação.

Arquivos já modificados pela correção anterior e preservados: `server/trackingDb.ts`, `server/exporter.ts`, `src/components/ContactsTable.tsx`, `src/components/ResultsDashboard.tsx`, `tests/test-email-verification.ts`. As evidências continuam sendo enviadas ao acompanhamento e o método de extração consta no CSV.

## Configurar e executar

Node.js 24 LTS recomendado. Extraia o ZIP em uma pasta própria e instale:

```sh
npm ci
npm run dev
```

Abra `http://localhost:3000`. O `.env` entregue é seguro para edição, com as chaves novas vazias. Também há `.env.example`. Configure nele ou na interface:

```dotenv
BRAVE_SEARCH_API_KEY=""
FIRECRAWL_API_KEY=""
YOU_API_KEY=""
EXA_API_KEY=""
OPENROUTER_API_KEY=""
OPENROUTER_MODEL="openai/gpt-4o-mini"
WEB_SEARCH_PROVIDER="auto"
SEARCH_MAX_RESULTS="5"
RENDER_PAGES_WITHOUT_EMAIL="true"
EXTERNAL_API_MAX_CALLS_PER_COMPANY="12"
EXTERNAL_API_TIMEOUT_MS="20000"
```

`YDC_API_KEY` é aceito como alias de `YOU_API_KEY`. Um campo vazio na interface usa o ambiente; uma chave preenchida prevalece. Os parâmetros do `.env` aparecem como valores padrão na tela, e os ajustes explícitos da interface prevalecem. Reinicie o servidor depois de editar `.env`.

Escolha um ID de modelo OpenRouter disponível na sua conta; o exemplo não garante acesso/créditos. Os testes de conexão fazem chamadas reais (busca, scrape de example.com ou geração curta) e podem consumir saldo. Cada botão testa exatamente o fornecedor selecionado, para não informar sucesso de outra API como se fosse da primeira.

No Windows, use `iniciar.bat` ou `start.bat`. O lançador foi ajustado para usar a pasta do próprio projeto. Outra opção:

```sh
node --import tsx server.ts
```

Configurações da interface são salvas na sessão existente; sem sessão, ficam na aplicação aberta até que uma sessão seja criada. Para configuração persistente independente de sessão, use `.env`. As chaves digitadas na interface podem ficar nos checkpoints locais de configuração; trate sua pasta `data/` como privada. O ZIP entregue não contém chaves reais.

## Testes realmente executados

- `npm test`: **23 testes da coleta + 38 testes das integrações passaram**.
- Integrações: precedência/alias/placeholder; adaptadores das três buscas; fallback 401/429/503/402; ausência de resultados e emails; fontes externas sem vínculo; prioridade e desativação; leitura direta/renderizada; fallback Firecrawl→You.com; HTML sem metadados; falha total; cache e orçamento; circuito/troca de chave/recuperação; erro sem chave exposta; timeout e cancelamento; teste individual das cinco APIs; ausência de chave; OpenRouter sem email inventado; geração com OpenRouter e fallback para OpenAI; análise de currículo com OpenRouter; status sem credenciais; valores padrão do ambiente.
- `node --import tsx tests/test-vacancies.ts`: **13/13 testes existentes passaram** na verificação do projeto. A funcionalidade de vagas não foi refeita.
- `npm run build`: passou; mantidos os avisos preexistentes de configuração Vite (`__dirname`) e chunk grande.
- TypeScript do código da aplicação e dos dois testes novos: passou com configuração temporária, omitida da entrega.
- Servidor iniciado com `node --import tsx server.ts` e teste HTTP na mesma execução: **GET `/api/integrations/status` retornou 200**, e os cinco **POST `/api/test-ai-connection` sem chave retornaram 400** com o fornecedor correto. Isso valida rotas e tratamento de ausência de credencial sem gastar saldo.
- `npm run lint` global: continua falhando pelo problema preexistente em `tests/test-materials-sanitization.ts`, que importa `sanitizeMaterialText` sem exportação correspondente. Não foi alterado o teste antigo nem a configuração global para esconder essa falha.
- Integridade e conteúdo do ZIP conferidos; código, configurações e documentação incluídos; `node_modules`, `dist`, arquivos temporários e credenciais reais excluídos.

## Limitações

Os testes automatizados de provedores usam respostas simuladas e chaves falsas. Não houve validação com suas contas reais, consumo de créditos nem teste visual no navegador/Windows. Endpoints/parâmetros foram conferidos nas documentações oficiais; planos, acesso aos modelos e comportamento real das páginas podem variar.

Nenhum fallback garante sucesso quando todos os serviços estão sem chave, saldo ou acesso. A confirmação é conservadora, depende das páginas pesquisadas e não verifica entrega SMTP. HTML renderizado precisa ter o endereço publicado; não se usa extração por IA para completar emails ausentes. Revalidar muitos registros históricos pode levar tempo e fazer novas requisições.

Referências oficiais consultadas para implementação:
- https://api-dashboard.search.brave.com/api-reference/web/search/get
- https://docs.firecrawl.dev/api-reference/endpoint/scrape
- https://you.com/docs/api-reference/search/v1-search
- https://you.com/docs/api-reference/contents
- https://exa.ai/docs/reference/search
- https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion

## Atualização — candidaturas espontâneas automáticas

- Nova opção nas Configurações: **Gerar automaticamente materiais PT / EN para Candidatura Espontânea**, desativada por padrão e persistida por sessão.
- Inclui todos os contatos verificados sem vaga associada, inclusive Contato Geral. Ao salvar configurações de uma sessão com a opção ativa, processa os pendentes já coletados em segundo plano. Novos contatos são processados na coleta; a retomada também processa pendentes existentes.
- No modo automático, a tabela substitui o botão individual por uma indicação de geração automática pendente. Materiais prontos continuam disponíveis para visualizar e editar. Desativar a opção devolve o botão sob demanda.
- Email, mensagem curta e carta são exigidos em PT e EN. Uma resposta sem um idioma não é completada copiando o outro: aciona o fallback e, se todos falharem, mantém pendente. Materiais bilíngues completos já existentes são preservados.
- Gera textos, sem enviar emails/candidaturas. Contatos não confirmados mantêm ressalva nas notas de revisão. Nenhum cargo/vaga é criado para uma candidatura espontânea.
- Falhas ficam nos logs. Após corrigir as APIs, salve as configurações novamente para tentar os pendentes. Desativar interrompe a seleção dos próximos contatos, mas uma requisição em andamento pode terminar.
- Chamadas simultâneas para o mesmo contato compartilham a geração; a fila automática não se duplica por sessão. Cada sucesso é salvo, sem migrar registros antigos em lote.

Arquivos desta atualização: `src/materialPolicy.ts`, `src/types/index.ts`, `src/App.tsx`, `src/components/SettingsModal.tsx`, `src/components/ContactsTable.tsx`, `server/materialsGenerator.ts`, `server/jobRunner.ts`, `server.ts`, `tests/test-spontaneous-materials.ts`, `package.json`, `README.md`, `ALTERACOES.md`.

Execução: Node.js compatível com Vite 8; `npm ci`, copiar `.env.example` para `.env`, preencher suas chaves, `npm run dev`, abrir o endereço mostrado no terminal. Carregue/crie uma sessão, preencha o perfil e ative a nova opção nas Configurações. Chaves também podem ser informadas pela interface.

Testes realmente executados nesta atualização:

- `npm test`: 69 testes passaram (23 coleta, 38 integrações, 8 novos testes de materiais espontâneos), com HTTP e IA simulados. Os novos casos cobrem opção desligada, contato geral, exclusão de vaga associada, PT/EN com opção global desligada, preservação de materiais, resposta incompleta, fallback, concorrência e material antigo incompleto.
- `npm run build`: passou.
- TypeScript dos arquivos da aplicação e testes novos/coleta/integrações: passou, com configuração temporária de escopo, não incluída no ZIP.
- `npm run lint`: continua falhando no teste legado `tests/test-materials-sanitization.ts`, que importa `sanitizeMaterialText`, exportação inexistente desde antes desta alteração.

Limitações: não foram feitos testes com chaves reais nem validação visual em navegador. A validação exige os campos de ambos os idiomas, mas não certifica automaticamente a qualidade linguística dos textos gerados. Revise antes de enviar. A fila roda enquanto o servidor está aberto; após interrupção, retome a execução ou salve novamente as configurações.

## Atualização — busca recursiva em termos e privacidade

Quando as páginas iniciais terminam sem nenhum email comprovado, o crawler passa a visitar links reais de termos de uso, condições, páginas jurídicas e política de privacidade no domínio oficial ou seus subdomínios. Descobre esses links tanto na página inicial quanto nas subpáginas verificadas e continua descobrindo novos links legais nas próprias páginas legais. Também reconhece links de Support, Help, Suporte e Ajuda na fila inicial.

A etapa legal permite **até quatro páginas adicionais**, além do limite normal de páginas iniciais configurado, para não perder termos/privacidade quando esse limite já foi consumido. Mantém deduplicação, cancelamento, timeout, cache da pesquisa, limite das APIs externas e o verificador existente. Não monta caminhos como `/privacy` ou `/terms`: precisa encontrar um link real. Não segue links legais externos nesta etapa. Se o site não oferecer links descobertos, não adivinha URLs. Os limites podem impedir visitar todos os documentos em sites muito grandes.

Só salva emails explicitamente publicados em texto ou `mailto:`, com URL, evidência original, método e data. Endereços de privacidade/jurídico/suporte conservam sua classificação; não são promovidos a recrutamento. Se as páginas não tiverem email, retorna lista vazia e “Email não encontrado”; bloqueios/falhas mantêm “Não foi possível verificar a fonte”. Encontrar um contato não confirma que ele aceite currículos.

Arquivos alterados nesta atualização: `server/extractor.ts`, `tests/test-legal-email-fallback.ts`, `package.json`, `README.md`, `ALTERACOES.md`. Execução continua igual: `npm ci`, configurar `.env` a partir de `.env.example`, `npm run dev`.

Verificação executada: `npm test` passou com **76 testes** (23 coleta, 38 integrações, 8 materiais e 7 novos casos legais). Os novos casos verificam: termos após limite inicial, privacidade descoberta em contato com mailto, recursão termos→privacidade sem ciclos, ausência de fallback quando já há email, HTTP 403, documentos sem email, limite de quatro páginas e recusa de externos. `npm run build` passou; TypeScript de aplicação e testes atuais passou com configuração temporária de escopo. HTTP/IA simulados, sem chamadas reais ou validação visual em navegador. A falha preexistente do lint completo descrita acima permanece fora desta alteração.

## Atualização — assunto e estilo do email sem vaga

- Para materiais novos ou regenerados sem vaga associada, o código aplica **Customer Support & Operations Opportunities — [nome do perfil ativo]** ao assunto principal e às versões PT/EN, independentemente do assunto retornado pela IA. O assunto permanece em inglês nas duas versões.
- A geração sem vaga usa uma estrutura genérica: saudação à equipe, apresentação profissional, interesse pela empresa, experiência relevante e contribuição em Customer Support & Operations. A IA recebe instruções para não escrever “Spontaneous Application” na abertura/assunto, não presumir vaga e não inventar características da empresa. O corpo é personalizado e bilíngue, limitado aos fatos do perfil e da empresa.
- Vagas reais mantêm sua orientação e assunto específicos. Não há migração nem sobrescrita de textos já salvos/editados: para aplicar a materiais antigos, regenere pelo botão individual (desative temporariamente a opção automática se necessário).
- Arquivos alterados: `server/materialsGenerator.ts`, `tests/test-spontaneous-materials.ts`, `README.md`, `ALTERACOES.md`. Execução permanece `npm ci`, configurar `.env` com `.env.example`, `npm run dev`.
- Executados: `npm test` passou com **78 testes**, incluindo dois casos novos que confirmam assunto imposto mesmo quando a IA retorna o antigo e preservação do assunto para vaga real; também verificam a presença da referência apenas em geração sem vaga. Build e TypeScript de escopo passaram. APIs/sites simulados: não foi avaliada a qualidade de textos de um modelo real ou a interface em navegador. A limitação preexistente do lint completo permanece documentada acima.

## Atualização — importar e exportar chaves em JSON

Em **Configurações de Pesquisa & IA**, os botões **Importar JSON** e **Exportar JSON** permitem transportar as chaves de Gemini, OpenAI, Perplexity, OpenRouter, Brave, Firecrawl, You.com e Exa, junto com os quatro modelos de IA preenchidos. O export usa os valores atuais da tela, inclusive ainda não salvos; não acessa nem exporta credenciais existentes somente no `.env`. O JSON contém credenciais em texto aberto, com aviso na interface.

A importação é local, valida o arquivo inteiro antes de modificar os campos e não testa APIs nem salva automaticamente. Após importar, utilize os botões de teste existentes e clique em Salvar. Campos ausentes/vazios são preservados; chaves presentes substituem os respectivos valores. Aceita o formato exportado (format/version/credentials), objeto simples com nomes de campos do app ou nomes das variáveis `.env`. Rejeita JSON inválido, arrays, valores não textuais, quebras de linha, conflitos de aliases, arquivos acima de 64 KB e versões desconhecidas. Campos não reconhecidos são ignorados. Mensagens não mostram o conteúdo de credenciais inválidas.

Arquivos alterados: `src/apiCredentialsJson.ts`, `src/components/SettingsModal.tsx`, `tests/test-api-credentials-json.ts`, `package.json`, `README.md`, `ALTERACOES.md`.

Execução: permanece `npm ci`, configurar `.env` a partir de `.env.example`, `npm run dev`. Teste específico: `npm run test:keys`.

Verificação executada: `npm test` passou com **85 testes**, incluindo sete novos testes de roundtrip das oito APIs/modelos, aliases, campos vazios/desconhecidos, JSON/formato inválido, rejeição integral, conflitos/tamanho e BOM/erros sem vazamento. Build e verificação TypeScript de escopo passaram. Chaves de teste são fictícias; não houve teste visual do seletor/download em navegador nem chamadas de validação com credenciais reais. O lint completo continua com a limitação legada descrita acima.

## Atualização — copiar endereço de email

Adicionado botão **Copiar email** ao lado do destinatário no painel de materiais e na tabela de contatos. Copia somente o endereço, sem `mailto:`, assunto ou corpo, e mostra **Copiado!** usando o feedback existente. Não abre o cliente de email ao copiar.

Arquivos modificados: `src/components/ContactsTable.tsx`, `src/components/ResultsDashboard.tsx`, `ALTERACOES.md`. Sem dependências novas; execução permanece igual. Build e TypeScript de escopo executados e aprovados. Não foi feita validação do clipboard em navegador; a suíte de 85 testes anteriores não foi repetida para esta alteração de interface. Limitação preexistente de lint permanece descrita acima.
