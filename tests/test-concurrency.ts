import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {clampInt, runPool} from '../server/concurrency.js';
import {dataFs} from '../server/dataLifecycle.js';
let count=0;
const test=async(name:string,fn:()=>Promise<void>|void)=>{await fn();console.log('PASS '+name);count++;};
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 await test('clampInt limita, arredonda e usa fallback para valores inválidos',()=>{
  assert.equal(clampInt(99,1,6,1),6);assert.equal(clampInt(0,1,6,1),1);assert.equal(clampInt(2.6,1,6,1),3);
  for(const bad of [undefined,null,'3',NaN,Infinity])assert.equal(clampInt(bad,1,6,2),2);
 });
 await test('runPool processa tudo sem passar do limite',async()=>{
  let active=0,peak=0,done=0;
  await runPool(Array.from({length:12},(_,i)=>i),3,async()=>{active++;peak=Math.max(peak,active);await sleep(5);active--;done++;});
  assert.equal(done,12);assert.equal(peak,3);
 });
 await test('Limite 1 é sequencial e mantém a ordem',async()=>{
  const order:number[]=[];let active=0,peak=0;
  await runPool([1,2,3,4,5],1,async n=>{active++;peak=Math.max(peak,active);await sleep(2);order.push(n);active--;});
  assert.deepEqual(order,[1,2,3,4,5]);assert.equal(peak,1);
 });
 await test('Lista vazia e limite maior que a lista funcionam',async()=>{
  await runPool([],4,async()=>{throw new Error('não deve rodar');});
  let done=0;await runPool([1,2],6,async()=>{done++;});assert.equal(done,2);
 });
 await test('shouldStop impede novos itens (cancelamento)',async()=>{
  const seen:number[]=[];let stop=false;
  await runPool([1,2,3,4,5,6,7,8],2,async n=>{seen.push(n);if(n===2)stop=true;await sleep(5);},()=>stop);
  assert.ok(seen.length<8);
 });
 await test('Erro: não inicia novos, espera os em andamento e relança o primeiro',async()=>{
  let inFlightFinished=false;const started:number[]=[];
  await assert.rejects(runPool([1,2,3,4,5,6],2,async n=>{started.push(n);if(n===1)throw new Error('boom');await sleep(20);inFlightFinished=true;}),/boom/);
  assert.equal(inFlightFinished,true);assert.ok(started.length<6);
 });
 await test('Escritas simultâneas ao mesmo arquivo terminam na ordem das chamadas',async()=>{
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'conc-'));const file=path.join(dir,'sessao.json');
  try{
   await Promise.all(Array.from({length:40},(_,i)=>dataFs.writeFile(file,JSON.stringify({i,pad:'x'.repeat((40-i)*5000)}))));
   assert.equal(JSON.parse(await fsp.readFile(file,'utf-8')).i,39);
  }finally{await fsp.rm(dir,{recursive:true,force:true});}
 });
 await test('Reconciliação de vagas em paralelo não perde nem corrompe registros',async()=>{
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'conc-'));const previous=process.cwd();process.chdir(dir);
  try{
   const vacancies=await import('../server/vacancyManager.js');
   await Promise.all(Array.from({length:10},(_,i)=>vacancies.reconcileCompanyVacancies(`c${i}`,`Empresa ${i}`,[],[{title:`Vaga ${i}`,url:`https://e${i}.example/vaga`}])));
   const saved=JSON.parse(await fsp.readFile(path.join(dir,'data','vacancies_tracking.json'),'utf-8'));
   assert.equal(new Set(saved.map((v:any)=>v.companyId)).size,10);
  }finally{process.chdir(previous);await fsp.rm(dir,{recursive:true,force:true});}
 });
 console.log(`${count} testes de concorrência passaram.`);
})().catch(error=>{console.error(error);process.exit(1);});
