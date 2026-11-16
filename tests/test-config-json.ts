import assert from 'node:assert/strict';
import {API_KEY_FIELDS, SERVICE_CONFIG_FIELDS, CONFIG_SETTING_FIELDS, exportApiCredentials, exportConfig, importConfig} from '../src/apiCredentialsJson.js';
let count=0;
const test=(name:string,fn:()=>void)=>{fn();console.log('PASS '+name);count++;};
const full=():any=>{
 const data:any={
  aiProvider:'openrouter',searchProvider:'exa',webSearchEnabled:false,pageRetrievalEnabled:false,renderPagesWithoutEmail:false,
  generateDualLanguage:false,defaultViewLanguage:'en',generateMaterialsForPossible:true,generateMaterialsForSpontaneous:true,
  maxConcurrency:4,materialsConcurrency:5,maxPagesPerCompany:7,delayBetweenRequestsMs:900,requestTimeoutMs:15000,searchMaxResults:3,maxExternalCallsPerCompany:20,externalApiTimeoutMs:30000,
  geminiModel:'gemini-test',openaiModel:'openai-test',perplexityModel:'sonar-test',openrouterModel:'model/test',
 };
 for(const field of API_KEY_FIELDS)data[field]='FAKE_TEST_'+field;
 for(const field of SERVICE_CONFIG_FIELDS)data[field]='FAKE_TEST_'+field;
 return data;
};
test('Roundtrip completo: chaves, modelos e todos os ajustes da tela',()=>{
 const data=full();
 const imported:any=importConfig(exportConfig(data));
 for(const field of [...API_KEY_FIELDS,...SERVICE_CONFIG_FIELDS,...CONFIG_SETTING_FIELDS,'geminiModel','openaiModel','perplexityModel','openrouterModel'])assert.equal(imported[field],data[field],String(field));
});
test('Exportação não inclui campos que não estão na tela',()=>{
 const json=exportConfig({...full(),externalBrowserEndpoint:'http://x'});
 assert.ok(!json.includes('externalBrowserEndpoint'));
 assert.equal(JSON.parse(json).format,'recruitment-config');
});
test('Campos ausentes usam o valor que a tela mostra (padrão)',()=>{
 const parsed=JSON.parse(exportConfig({aiProvider:'auto',maxPagesPerCompany:5,requestTimeoutMs:10000,delayBetweenRequestsMs:600,maxConcurrency:1,generateMaterialsForPossible:false,generateDualLanguage:true} as any));
 assert.equal(parsed.settings.webSearchEnabled,true);assert.equal(parsed.settings.pageRetrievalEnabled,true);
 assert.equal(parsed.settings.defaultViewLanguage,'pt');assert.equal(parsed.settings.generateMaterialsForSpontaneous,false);assert.equal(parsed.settings.maxConcurrency,1);assert.equal(parsed.settings.materialsConcurrency,1);assert.ok(!('searchMaxResults' in parsed.settings));
 assert.deepEqual(parsed.credentials,{});
});
test('Arquivo antigo chaves-apis.json continua sendo aceito',()=>{
 const old=exportApiCredentials({geminiApiKey:'FAKE_G',openaiModel:'m'} as any);
 assert.deepEqual(importConfig(old),{geminiApiKey:'FAKE_G',openaiModel:'m'});
});
test('Objeto simples, aliases .env e só ajustes (sem chaves) são aceitos',()=>{
 assert.deepEqual(importConfig('{"OPENAI_API_KEY":"FAKE_K","aiProvider":"gemini"}'),{openaiApiKey:'FAKE_K',aiProvider:'gemini'});
 assert.deepEqual(importConfig('{"format":"recruitment-config","version":1,"settings":{"maxPagesPerCompany":3}}'),{maxPagesPerCompany:3});
});
test('Vazios e desconhecidos são ignorados sem sobrescrever estado',()=>{
 assert.deepEqual(importConfig('{"openaiApiKey":"","geminiApiKey":"FAKE_G","__proto__":{"admin":true},"qualquer":1}'),{geminiApiKey:'FAKE_G'});
});
test('Números fora da faixa da tela são ajustados ao limite',()=>{
 assert.deepEqual(importConfig('{"settings":{"maxPagesPerCompany":50,"delayBetweenRequestsMs":1,"searchMaxResults":2.6,"maxConcurrency":99,"materialsConcurrency":0}}'),{maxPagesPerCompany:12,delayBetweenRequestsMs:100,searchMaxResults:3,maxConcurrency:6,materialsConcurrency:1});
});
test('Valores de tipo ou opção inválidos rejeitam o arquivo inteiro',()=>{
 for(const text of ['{"settings":{"aiProvider":"evil"}}','{"settings":{"defaultViewLanguage":"fr"}}','{"settings":{"searchProvider":1}}','{"settings":{"webSearchEnabled":"true"}}','{"settings":{"maxPagesPerCompany":"5"}}','{"settings":{"maxPagesPerCompany":null}}','{"geminiApiKey":"FAKE","openaiApiKey":42}','{"openaiApiKey":"A\\nB"}'])assert.throws(()=>importConfig(text),text);
});
test('Estrutura, formato, versão, conflito e tamanho inválidos são rejeitados',()=>{
 for(const text of ['invalid','[]','null','{}','{"version":2,"aiProvider":"auto"}','{"format":"outro","aiProvider":"auto"}','{"credentials":[]}','{"settings":"x"}','{"YOU_API_KEY":"one","YDC_API_KEY":"two"}',' '.repeat(65537)])assert.throws(()=>importConfig(text),text);
});
test('Mensagem de erro não vaza o valor da chave',()=>{
 assert.throws(()=>importConfig('{"openaiApiKey":"SECRET\\nVALUE"}'),error=>!String(error).includes('SECRET'));
});
console.log(`${count} testes de config.json passaram.`);
