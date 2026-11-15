import assert from 'node:assert/strict';
import {API_KEY_FIELDS, exportApiCredentials, importApiCredentials} from '../src/apiCredentialsJson.js';
let count=0;
const test=(name:string,fn:()=>void)=>{fn();console.log('PASS '+name);count++;};
test('Roundtrip das oito APIs e modelos sem outras configurações',()=>{
 const data:any={aiProvider:'auto',maxPagesPerCompany:50,geminiModel:'gemini-test',openrouterModel:'model/test'};
 for(const field of API_KEY_FIELDS)data[field]='FAKE_TEST_'+field;
 const json=exportApiCredentials(data);assert.deepEqual(importApiCredentials(json),Object.fromEntries([...API_KEY_FIELDS,'geminiModel','openrouterModel'].map(field=>[field,data[field]])));
 assert.ok(!json.includes('maxPagesPerCompany'));
});
test('Objeto simples e aliases .env aceitos',()=>assert.deepEqual(importApiCredentials('{"OPENAI_API_KEY":"FAKE_TEST_KEY","YDC_API_KEY":"FAKE_YOU_KEY"}'),{openaiApiKey:'FAKE_TEST_KEY',youApiKey:'FAKE_YOU_KEY'}));
test('Campos vazios e desconhecidos não sobrescrevem estado',()=>assert.deepEqual(importApiCredentials('{"openaiApiKey":"","geminiApiKey":"FAKE_GEMINI_KEY","__proto__":{"admin":true},"aiProvider":"evil"}'),{geminiApiKey:'FAKE_GEMINI_KEY'}));
test('Arquivo malformado, array, null e versão errada rejeitados',()=>{
 for(const text of ['invalid','[]','null','{"version":2,"openaiApiKey":"x"}','{"credentials":[]}'])assert.throws(()=>importApiCredentials(text));
});
test('Importação inválida inteira rejeitada sem aceitar parcialmente',()=>assert.throws(()=>importApiCredentials('{"geminiApiKey":"FAKE_KEY","openaiApiKey":42}')));
test('Sem chaves, conflitos e tamanho excessivo rejeitados',()=>{
 for(const text of ['{}','{"geminiModel":"model"}','{"YOU_API_KEY":"one","YDC_API_KEY":"two"}',' '.repeat(65537)])assert.throws(()=>importApiCredentials(text));
});
test('BOM e espaços aceitos; erro não expõe credencial',()=>{
 assert.deepEqual(importApiCredentials('\uFEFF{"openaiApiKey":" FAKE_TEST_KEY "}'),{openaiApiKey:'FAKE_TEST_KEY'});
 assert.throws(()=>importApiCredentials('{"openaiApiKey":"SECRET\\nVALUE"}'),error=>!String(error).includes('SECRET'));
});
console.log(`${count} testes de JSON passaram; somente chaves fictícias.`);
