import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const initial = process.cwd(), isolated = await mkdtemp(path.join(tmpdir(), 'spontaneous-'));
process.chdir(isolated);
for (const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','PERPLEXITY_API_KEY','OPENROUTER_API_KEY']) delete process.env[key];
const { verifyStoredContact } = await import('../server/emailVerification.js');
const runner = await import('../server/jobRunner.js');
const { generateMaterialsForContact } = await import('../server/materialsGenerator.js');
const { automaticSpontaneous, materialsReady } = await import('../src/materialPolicy.js');
const profile:any = { name:'Pessoa', targetRoles:[], prioritySkills:[], experiences:[], education:[], certifications:[], languages:[], professionalLinks:[] };
const settings:any = { generateMaterialsForSpontaneous:true, generateDualLanguage:false, aiProvider:'openrouter', openrouterApiKey:'TEST_ONLY_FAKE_KEY', requestTimeoutMs:1000 };
const pt = { subject:'Apresentação', coldEmail:'Gostaria de me apresentar.', shortMessage:'Olá, quem recebe candidaturas?', coverLetter:'Apresento meu interesse profissional.' };
const en = { subject:'Introduction', coldEmail:'I would like to introduce myself.', shortMessage:'Hello, who receives applications?', coverLetter:'I am expressing my professional interest.' };
let payload:any = { pt, en }, calls = 0, fallback = false, vacancyMode = false;
const original = globalThis.fetch;
globalThis.fetch = async (input:any, init?:any) => {
 const url = String(input);
 if (url.includes('openrouter') || url.includes('api.openai.com')) {
   calls++;
   const instruction = JSON.parse(init.body).messages[0].content;
   if (!vacancyMode) {
     assert.match(instruction, /CANDIDATURA ESPONTÂNEA/);
     assert.match(instruction, /estrutura profissional/);
     assert.ok(!instruction.includes('legacy sample company'));
   } else {
     assert.ok(!instruction.includes('legacy sample company'));
   }
   return Response.json({ choices:[{ message:{content:JSON.stringify(fallback && url.includes('api.openai.com') ? {pt,en} : payload)} }] });
 }
 const response = new Response('<p>info@acme.test</p>');
 Object.defineProperty(response,'url',{value:url}); return response;
};
let count = 0;
const test = async (name:string, fn:()=>any) => { await fn(); console.log('PASS '+name); count++; };
try {
 const contact:any = await verifyStoredContact({ id:'c', email:'info@acme.test', companyName:'Acme', site:'https://acme.test', sourceUrl:'https://acme.test', classification:'Contato Geral', materialsGenerated:false });
 assert.ok(contact);
 const company:any = { id:'co', name:'Acme', normalizedUrl:'https://acme.test', status:'Concluído parcialmente', contacts:[contact], vacanciesFound:[] };
 const session:any = { sessionId:'auto', settings, profile, companies:[company], logs:[], status:'completed' };
 await runner.saveSessionCheckpoint(session);
 await test('Opção desligada mantém contato geral sob demanda',async()=>{session.settings={...settings,generateMaterialsForSpontaneous:false};await runner.queueSpontaneousMaterials('auto');assert.equal(calls,0);assert.equal(contact.materialsGenerated,false);});
 await test('Todos os espontâneos incluem Contato Geral, mas não vaga associada',()=>{assert.equal(automaticSpontaneous(contact,settings),true);assert.equal(automaticSpontaneous({...contact,associatedJob:{title:'Developer'}},settings),false);});
 await test('Fila gera PT/EN para contato geral existente, mesmo com toggle global desligado',async()=>{session.settings=settings;await runner.queueSpontaneousMaterials('auto');assert.equal(calls,1);assert.equal(contact.materials.pt.coldEmail,pt.coldEmail);assert.equal(contact.materials.en.coldEmail,en.coldEmail);assert.match(contact.materials.pt.reviewNotes,/não há comprovação/);});
 await test('Salvar ou retomar preserva materiais completos',async()=>{await runner.queueSpontaneousMaterials('auto');assert.equal(calls,1);assert.equal(materialsReady(contact,settings),true);});
 await test('Resposta apenas PT não vira inglês copiado nem marca sucesso',async()=>{payload={pt};contact.materialsGenerated=false;contact.materials=undefined;await runner.queueSpontaneousMaterials('auto');assert.equal(contact.materialsGenerated,false);assert.equal(contact.materials,undefined);});
 await test('Resposta incompleta aciona próximo provedor',async()=>{fallback=true;const result=await generateMaterialsForContact(contact,company,profile,[contact],{...settings,openaiApiKey:'TEST_ONLY_OPENAI_KEY'});assert.equal(result.generatedBy,'openai');assert.equal(result.en?.coldEmail,en.coldEmail);fallback=false;});
 await test('Chamadas concorrentes compartilham geração sem duplicar consumo',async()=>{payload={pt,en};const before=calls;await Promise.all([runner.queueSpontaneousMaterials('auto'),runner.queueSpontaneousMaterials('auto'),runner.generateSingleContactMaterials('auto','c')]);assert.equal(calls,before+1);assert.equal(contact.materialsGenerated,true);});
 await test('Material antigo só PT fica pendente no modo automático',()=>assert.equal(materialsReady({...contact,materials:{pt}},settings),false));
 await test('Assunto solicitado aplicado a PT, EN e campo principal independentemente da IA',async()=>{
   payload={pt:{...pt,subject:'Candidatura Espontânea'},en:{...en,subject:'Spontaneous Application - Customer Support Leader'}};
   const result=await generateMaterialsForContact(contact,company,profile,[contact],settings);
   for(const subject of [result.subject,result.pt?.subject,result.en?.subject]) assert.equal(subject,'Customer Support & Operations Opportunities — Pessoa');
 });
 await test('Vaga real preserva assunto e orientação específicos',async()=>{
   vacancyMode=true;payload={pt,en};
   const result=await generateMaterialsForContact({...contact,associatedJob:{title:'Support Manager'}},company,profile,[],settings);
   assert.equal(result.pt?.subject,pt.subject);assert.equal(result.en?.subject,en.subject);vacancyMode=false;
 });
 console.log(`${count} testes passaram; sites e IA simulados, sem envio de candidaturas.`);
} finally { globalThis.fetch=original;process.chdir(initial);await rm(isolated,{recursive:true,force:true}); }
