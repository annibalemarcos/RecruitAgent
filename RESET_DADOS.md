# Reset dos dados

Abra **Configurações**, role até **Zerar dados do aplicativo** e clique em
**Apagar todos os dados (reset)**. Confirme a exclusão permanente na janela do navegador.

O reset apaga recursivamente todo o conteúdo de `data/`, incluindo sessões,
ponteiro da última sessão, contatos, materiais, vagas e histórico do CRM.
Interrompe as pesquisas, limpa os caches do servidor e impede tarefas antigas
de restaurarem os arquivos após a limpeza. Ao concluir, o navegador retorna à entrada.

Arquivos fora de `data/` são preservados, incluindo `.env`, currículos, CSVs e
`config.json`. Chaves e perfis que existiam somente dentro de uma sessão
apagada também são removidos com essa sessão.

Não há exclusão ao instalar ou iniciar esta versão: a limpeza só acontece ao
acionar e confirmar o botão. Para atualizar uma instalação existente, copie os
arquivos do app e preserve sua pasta `data/` até decidir usar o reset.

Validação: `npm run test:reset` executa testes em uma pasta temporária, sem
apagar os dados reais.
