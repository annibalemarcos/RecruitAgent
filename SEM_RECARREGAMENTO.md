# Dashboard sem recarregamento automático

Pare o servidor com Ctrl+C, atualize os arquivos do projeto e execute iniciar.bat.
Não é necessário reinstalar dependências.

Esta versão desativa HMR e observação de arquivos por padrão. Os dados em data/
não são examinados pelo Tailwind. Logs, progresso e resultados continuam sendo
atualizados por SSE, sem recarregar a página ou voltar ao topo.

Para aplicar a proteção imediatamente no PowerShell, sem atualizar os arquivos:

```powershell
$env:DISABLE_HMR = "true"
npm.cmd start
```

Apenas para desenvolvimento, habilite explicitamente ENABLE_HMR=true e remova
DISABLE_HMR. Mesmo nesse modo, data/ fica fora da observação de arquivos.

O reset das configurações continua recarregando a página uma única vez após a
exclusão confirmada dos dados. Atualizações manuais do navegador também continuam
funcionando.
