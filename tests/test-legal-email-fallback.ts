import assert from 'node:assert/strict';
import { crawlCompany } from '../server/extractor.js';
const original=globalThis.fetch;
let pages:Record<string,string|number>={}, calls:string[]=[], count=0;
globalThis.fetch=async(input:any)=>{
 const url=new URL(String(input)).href; calls.push(url);
 const content=pages[url] ?? '<p>Sem email</p>';
 const response=typeof content==='number'?new Response('invented@acme.test',{status:content}):new Response(content);
 Object.defineProperty(response,'url',{value:url});return response;
};
const root='https://acme.test/';
const run=()=>crawlCompany('legal','Acme',root,2,100,0,undefined,undefined,[],{renderPagesWithoutEmail:false,maxExternalCallsPerCompany:0});
const test=async(name:string,fn:()=>any)=>{pages={};calls=[];await fn();count++;console.log('PASS '+name);};
try {
 await test('Sem email inicial busca termos mesmo após esgotar limite normal',async()=>{
 pages[root]='<a href="/contact">Contact</a><a href="/terms">Terms of service</a>';
 pages[root+'terms']='<p>Support: support@acme.test</p>';
 const r=await run();assert.equal(r.contacts[0].email,'support@acme.test');assert.equal(r.contacts[0].sourceUrl,root+'terms');assert.ok(r.contacts[0].collectedAt);assert.match(r.contacts[0].evidenceSnippet,/support@acme.test/);
 });
 await test('Privacidade descoberta na página de contato e mailto preservado',async()=>{
 pages[root]='<a href="/contact">Contato</a>';pages[root+'contact']='<a href="/document/42">Política de Privacidade</a>';
 pages[root+'document/42']='<a href="mailto:privacy@acme.test">DPO</a>';
 const r=await run();assert.equal(r.contacts[0].email,'privacy@acme.test');assert.equal(r.contacts[0].extractionMethod,'mailto');assert.notEqual(r.contacts[0].classification,'Recrutamento confirmado');
 });
 await test('Recursão termos -> privacidade, sem ciclos ou URLs inventadas',async()=>{
 pages[root]='<a href="/terms">Terms</a>';pages[root+'terms']='<a href="/terms">Terms</a><a href="/policy">Privacy policy</a>';
 pages[root+'policy']='<p>help@acme.test</p>';const r=await run();assert.equal(r.contacts[0].email,'help@acme.test');assert.equal(r.visitedPages.filter(u=>u===root+'terms').length,1);assert.ok(!calls.some(u=>u===root+'privacy'));
 });
 await test('Email inicial dispensa fallback legal',async()=>{
 pages[root]='<p>hr@acme.test</p><a href="/terms">Terms</a>';const r=await run();assert.equal(r.contacts[0].email,'hr@acme.test');assert.ok(!calls.includes(root+'terms'));
 });
 await test('Termos bloqueados e privacidade vazia mantêm lista vazia e falha de verificação',async()=>{
 pages[root]='<a href="/terms">Terms</a><a href="/privacy">Privacy</a>';pages[root+'terms']=403;
 const r=await run();assert.deepEqual(r.contacts,[]);assert.equal(r.status,'Não foi possível verificar a fonte');assert.ok(calls.includes(root+'privacy'));
 });
 await test('Sem email legal retorna Email não encontrado',async()=>{
 pages[root]='<a href="/terms">Termos</a><a href="/privacy">Privacidade</a>';const r=await run();assert.deepEqual(r.contacts,[]);assert.equal(r.status,'Email não encontrado');
 });
 await test('Orçamento de quatro páginas legais e externo não visitado',async()=>{
 pages[root]=Array.from({length:8},(_,i)=>`<a href="/terms/${i}">Terms ${i}</a>`).join('')+'<a href="https://evil.test/privacy">Privacy</a>';
 const r=await run();assert.equal(r.visitedPages.length,5);assert.ok(!calls.some(u=>u.includes('evil.test')));
 });
 console.log(`${count} testes legais passaram; HTTP simulado.`);
} finally {globalThis.fetch=original;}
