import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const initial=process.cwd(), isolated=await mkdtemp(path.join(tmpdir(),'integrations-'));
process.chdir(isolated);
for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','OPENAI_API_KEY','PERPLEXITY_API_KEY','BRAVE_SEARCH_API_KEY','FIRECRAWL_API_KEY','YOU_API_KEY','YDC_API_KEY','EXA_API_KEY','OPENROUTER_API_KEY'])delete process.env[k];
const api=await import('../server/integrations.js');
const {enhanceCompanySearchWithWeb}=await import('../server/webSearchEnhancer.js');
const {enhanceCompanySearchWithAI}=await import('../server/aiSearchEnhancer.js');
const {fetchVerifiedPage}=await import('../server/pageAccess.js');
const {crawlCompany}=await import('../server/extractor.js');
const {generateMaterialsForContact}=await import('../server/materialsGenerator.js');
const {unblockProviderCircuit}=await import('../server/credentials.js');
const original=globalThis.fetch,key='TEST_ONLY_FAKE_KEY';
const settings:any={braveApiKey:key,youApiKey:key,exaApiKey:key,firecrawlApiKey:key,openrouterApiKey:key,requestTimeoutMs:30,renderPagesWithoutEmail:false,externalApiTimeoutMs:1000};
let count=0,calls:string[]=[],errors:Record<string,number>={},urls:Record<string,string[]>={},html='',directFail=false,custom:any=null,ai:any={};
const test=async(name:string,fn:()=>any)=>{calls=[];errors={};urls={brave:['https://acme.test/contact'],you:['https://acme.test/contact'],exa:['https://acme.test/contact']};html='<p>contact@acme.test</p>';directFail=false;custom=null;for(const p of api.INTEGRATIONS)api.resetIntegrationCircuit(p);for(const p of ['gemini','openai','perplexity','openrouter'] as const)unblockProviderCircuit(p);await fn();count++;console.log('PASS '+name);};
globalThis.fetch=async(input:any,init?:any)=>{
 const u=typeof input==='string'?input:input.url||String(input);calls.push(u);
 if(custom){const r=await custom(u,init);if(r)return r;}
 const p=u.includes('api.search.brave.com')?'brave':u.includes('v1/search')?'you':u.includes('api.exa.ai')?'exa':u.includes('firecrawl')?'firecrawl':u.includes('v1/contents')?'contents':u.includes('openrouter')?'openrouter':u.includes('api.openai.com')?'openai':null;
 if(p&&errors[p])return Response.json({error:{message:'upstream key '+key}},{status:errors[p]});
 if(p==='brave')return Response.json({web:{results:urls.brave.map(url=>({url,description:'invented@acme.test'}))}});
 if(p==='you')return Response.json({results:{web:urls.you.map(url=>({url,snippets:['invented@acme.test']}))}});
 if(p==='exa')return Response.json({results:urls.exa.map(url=>({url,text:'invented@acme.test'}))});
 if(p==='firecrawl'){const b=JSON.parse(init.body);assert.equal(b.maxAge,0);assert.equal(b.onlyMainContent,false);return Response.json({success:true,data:{html,metadata:{url:b.url,statusCode:200}}});}
 if(p==='contents'){const b=JSON.parse(init.body);assert.equal(b.max_age,0);return Response.json([{url:b.urls[0],html}]);}
 if(p==='openrouter'||p==='openai')return Response.json({choices:[{message:{content:JSON.stringify(ai)}}]});
 if(directFail)throw new Error('blocked');const r=new Response(html);Object.defineProperty(r,'url',{value:u});return r;
};
try{
 await test('Interface precede .env',()=>{process.env.BRAVE_SEARCH_API_KEY='ENV_FAKE_KEY';assert.equal(api.resolveIntegration('brave',settings).key,key);delete process.env.BRAVE_SEARCH_API_KEY;});
 await test('Alias YDC e campo vazio',()=>{process.env.YDC_API_KEY='ENV_YOU_FAKE_KEY';assert.equal(api.resolveIntegration('you',{youApiKey:''}).key,'ENV_YOU_FAKE_KEY');delete process.env.YDC_API_KEY;});
 await test('Placeholder ignorado',()=>assert.equal(api.resolveIntegration('exa',{exaApiKey:'SUA_CHAVE_AQUI'}).isConfigured,false));
 for(const p of ['brave','you','exa'] as const)await test('Busca '+p,async()=>assert.deepEqual(await api.searchWithProvider(p,'Acme',settings),['https://acme.test/contact']));
 await test('Brave 401 -> You',async()=>{errors.brave=401;const r=await enhanceCompanySearchWithWeb('Acme','https://acme.test',settings);assert.equal(r?.sourceProvider,'you');assert.equal(r?.contacts[0].email,'contact@acme.test');});
 await test('Brave 429 -> You 503 -> Exa',async()=>{errors.brave=429;errors.you=503;assert.equal((await enhanceCompanySearchWithWeb('Acme','https://acme.test',settings))?.sourceProvider,'exa');});
 await test('Resultado vazio -> próxima busca',async()=>{urls.brave=[];assert.equal((await enhanceCompanySearchWithWeb('Acme','https://acme.test',settings))?.sourceProvider,'you');});
 await test('Snippet não comprova email; tenta todos',async()=>{html='<p>Sem email</p>';const r=await enhanceCompanySearchWithWeb('Acme','https://acme.test',settings);assert.deepEqual(r?.contacts,[]);assert.ok(calls.some(u=>u.includes('api.exa.ai')));});
 await test('Externo sem vínculo rejeitado',async()=>{urls.brave=urls.you=urls.exa=['https://external.test/contact'];const r=await enhanceCompanySearchWithWeb('Acme','https://acme.test',settings);assert.deepEqual(r?.contacts,[]);assert.ok(!calls.some(u=>u.startsWith('https://external.test')));});
 await test('Prioridade Exa',async()=>assert.equal((await enhanceCompanySearchWithWeb('Acme','https://acme.test',{...settings,searchProvider:'exa'}))?.sourceProvider,'exa'));
 await test('Busca desligada',async()=>{assert.equal(await enhanceCompanySearchWithWeb('Acme','https://acme.test',{...settings,webSearchEnabled:false}),null);assert.equal(calls.length,0);});
 await test('Direto não chama API paga',async()=>{assert.equal((await fetchVerifiedPage('https://acme.test',30,undefined,settings)).retrievalProvider,'direct');assert.equal(calls.length,1);});
 await test('Direto falha -> Firecrawl',async()=>{directFail=true;assert.equal((await fetchVerifiedPage('https://acme.test',30,undefined,settings)).retrievalProvider,'firecrawl');});
 await test('Firecrawl 402 -> You Contents',async()=>{directFail=true;errors.firecrawl=402;assert.equal((await fetchVerifiedPage('https://acme.test',30,undefined,settings)).retrievalProvider,'you');});
 await test('HTML JS recebe mailto renderizado',async()=>{custom=(u:string)=>{if(u.startsWith('https://acme.test')){const r=new Response('<script>app()</script>');Object.defineProperty(r,'url',{value:u});return r;}};html='<a href="mailto:talent@acme.test">Enviar</a>';const r=await crawlCompany('c','Acme','https://acme.test',1,30,0,undefined,undefined,[],{...settings,renderPagesWithoutEmail:true});assert.equal(r.contacts[0].email,'talent@acme.test');assert.equal(r.contacts[0].retrievalProvider,'firecrawl');});
 await test('Firecrawl sem status é rejeitado',async()=>{directFail=true;errors.contents=503;custom=(u:string)=>u.includes('firecrawl')?Response.json({success:true,data:{html,metadata:{url:'https://acme.test'}}}):null;await assert.rejects(fetchVerifiedPage('https://acme.test',30,undefined,settings));});
 await test('Todas leituras falham: lista vazia',async()=>{directFail=true;errors.firecrawl=403;errors.contents=503;const r=await crawlCompany('c','Acme','https://acme.test',1,30,0,undefined,undefined,[],settings);assert.deepEqual(r.contacts,[]);assert.equal(r.status,'Não foi possível verificar a fonte');});
 await test('Cache evita acesso repetido',async()=>{const c=api.createIntegrationContext(settings);await fetchVerifiedPage('https://acme.test',30,undefined,settings,c);await fetchVerifiedPage('https://acme.test',30,undefined,settings,c);assert.equal(calls.length,1);});
 await test('Limite de chamadas',async()=>{const c=api.createIntegrationContext({...settings,maxExternalCallsPerCompany:1});await api.searchWithProvider('brave','Acme',settings,c);await assert.rejects(api.searchWithProvider('you','Acme',settings,c),/limite/);assert.equal(calls.length,1);});
 await test('Circuito por chave e troca de chave',async()=>{errors.brave=401;await assert.rejects(api.searchWithProvider('brave','Acme',settings));errors={};await assert.rejects(api.searchWithProvider('brave','Acme',settings),/suspenso/);await api.searchWithProvider('brave','Acme',{...settings,braveApiKey:'OTHER_FAKE_KEY'});assert.equal(calls.length,2);});
 await test('Teste recupera circuito',async()=>{errors.brave=401;await assert.rejects(api.searchWithProvider('brave','Acme',settings));errors={};assert.equal((await api.testIntegration('brave',key)).success,true);await api.searchWithProvider('brave','Acme',settings);});
 await test('Erro não expõe chave',async()=>{errors.brave=401;try{await api.searchWithProvider('brave','Acme',settings);assert.fail();}catch(e){assert.ok(!String(e).includes(key));}});
 await test('Timeout da API',async()=>{custom=(u:string,i:any)=>u.includes('api.search.brave.com')?new Promise((_,reject)=>i.signal.addEventListener('abort',()=>reject(new Error('timeout')))):null;await assert.rejects(api.searchWithProvider('brave','Acme',settings),/tempo limite/);});
 await test('Cancelamento não chama alternativa',async()=>{const c=new AbortController();c.abort();await assert.rejects(enhanceCompanySearchWithWeb('Acme','https://acme.test',settings,undefined,c.signal));assert.equal(calls.length,0);});
 for(const p of api.INTEGRATIONS)await test('Teste manual '+p,async()=>{ai={ok:true};assert.equal((await api.testIntegration(p,key)).success,true);});
 await test('Teste sem chave não chama API',async()=>{assert.equal((await api.testIntegration('brave')).success,false);assert.equal(calls.length,0);});
 await test('OpenRouter não inventa email',async()=>{html='<p>Sem email</p>';ai={careersUrl:'https://acme.test/careers',contacts:[{email:'invented@acme.test'}]};const r=await enhanceCompanySearchWithAI('Acme','https://acme.test',{aiProvider:'openrouter',openrouterApiKey:key,requestTimeoutMs:30,webSearchEnabled:false} as any);assert.equal(r?.sourceProvider,'openrouter');assert.deepEqual(r?.contacts,[]);});
 await test('OpenRouter falha -> OpenAI gera materiais',async()=>{errors.openrouter=503;ai={pt:{subject:'Olá',coldEmail:'Texto',shortMessage:'Mensagem',coverLetter:'Carta',reviewNotes:'Revisar'},en:{subject:'Hello',coldEmail:'Text',shortMessage:'Message',coverLetter:'Letter',reviewNotes:'Review'}};const p:any={name:'Candidato',location:'Brasil',email:'candidate@acme.test',summary:'Experiência',targetRoles:[],prioritySkills:[],experiences:[],education:[],certifications:[],languages:[],professionalLinks:[],materialLanguage:'both'};const c:any={email:'contact@acme.test',companyName:'Acme',classification:'Recrutamento confirmado',evidenceSnippet:html};assert.equal((await generateMaterialsForContact(c,{name:'Acme',normalizedUrl:'https://acme.test'} as any,p,[c],{...settings,aiProvider:'openrouter',openaiApiKey:key})).generatedBy,'openai');});
 await test('Status não revela chave',()=>{process.env.EXA_API_KEY='ENV_FAKE_EXA';assert.ok(!JSON.stringify(api.integrationStatus()).includes('ENV_FAKE_EXA'));delete process.env.EXA_API_KEY;});
 await test('Defaults respeitam .env e limites',()=>{process.env.EXTERNAL_API_MAX_CALLS_PER_COMPANY='200';process.env.RENDER_PAGES_WITHOUT_EMAIL='false';assert.equal(api.integrationDefaults().maxExternalCallsPerCompany,100);assert.equal(api.integrationDefaults().renderPagesWithoutEmail,false);delete process.env.EXTERNAL_API_MAX_CALLS_PER_COMPANY;delete process.env.RENDER_PAGES_WITHOUT_EMAIL;});
 await test('OpenRouter gera materiais com prioridade',async()=>{ai={pt:{subject:'Olá',coldEmail:'Texto',shortMessage:'Mensagem',coverLetter:'Carta',reviewNotes:'Revisar'},en:{subject:'Hello',coldEmail:'Text',shortMessage:'Message',coverLetter:'Letter',reviewNotes:'Review'}};const p:any={name:'Candidato',location:'Brasil',email:'candidate@acme.test',summary:'Experiência',targetRoles:[],prioritySkills:[],experiences:[],education:[],certifications:[],languages:[],professionalLinks:[],materialLanguage:'both'};const c:any={email:'contact@acme.test',companyName:'Acme',classification:'Recrutamento confirmado',evidenceSnippet:html};assert.equal((await generateMaterialsForContact(c,{name:'Acme',normalizedUrl:'https://acme.test'} as any,p,[c],{...settings,aiProvider:'openrouter'})).generatedBy,'openrouter');});
 await test('Parser de currículo usa OpenRouter',async()=>{const {parseResumeWithAI}=await import('../server/documentParser.js');ai={name:'Candidato',summary:'Experiência declarada',experiences:[]};const p=await parseResumeWithAI('Candidato; Experiência declarada','pt',{...settings,aiProvider:'openrouter'});assert.equal(p.name,'Candidato');assert.ok(calls.some(u=>u.includes('openrouter')));});
 console.log(`${count} testes de integração passaram; APIs e sites simulados.`);
}finally{globalThis.fetch=original;process.chdir(initial);await rm(isolated,{recursive:true,force:true});}
