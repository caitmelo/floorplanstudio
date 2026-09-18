import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {splitInstructions,parseFixture,validatePlan} from '../web/hybrid-contract.mjs';
import {drawFixture,protectTextPixels,chooseFixtureRect,textBoxes} from '../web/fixtures.mjs';
import worker from '../server/index.mjs';
const require=createRequire(import.meta.url);
const {createCanvas}=require((process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules')+'/@napi-rs/canvas');
test('exhausted AI credits produce a clear error without revealing upstream details',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:'credit_balance_exhausted',type:'insufficient_quota',message:'private upstream details'}}),{status:429});
 try{
  const request=new Request('http://127.0.0.1:4173/api/plan',{method:'POST',headers:{Origin:'http://127.0.0.1:4173','Content-Type':'application/json'},body:JSON.stringify({instruction:'Explain this plan',width:1200,height:800,labels:[],image:'data:image/png;base64,AAAA'})});
  const response=await worker.fetch(request,{OPENAI_API_KEY:'test-only'});const body=await response.json();
  assert.equal(response.status,503);assert.equal(body.code,'AI_QUOTA_EXHAUSTED');assert(!JSON.stringify(body).includes('private upstream'));
 }finally{globalThis.fetch=previous;}
});
test('agent wording and multiple instructions',()=>{for(const s of ['add built in bbq in alfresco','add a built-in barbecue on left wall','add another car icon to driveway','add a toilet icon on the left wall'])assert(parseFixture(s));assert.equal(parseFixture('add a barbecue').fixture,'bbq');assert.equal(splitInstructions("rename basement to wine room and add a second car icon in garage and rename garage to double garage").length,3);assert.equal(splitInstructions('replace "living and dining" with "family room"').length,1)});
test('fixtures leave every pixel outside their rectangle unchanged',()=>{for(const kind of ['bbq','car','toilet','sink','bath','shower']){const c=createCanvas(300,200),g=c.getContext('2d');g.fillStyle='#ddd';g.fillRect(0,0,300,200);const before=g.getImageData(0,0,300,200).data;drawFixture(g,{x:30,y:30,w:80,h:100},kind);const after=g.getImageData(0,0,300,200).data;let changes=0;for(let y=0;y<200;y++)for(let x=0;x<300;x++){const i=(y*300+x)*4;if(x<30||x>=110||y<30||y>=130)assert.deepEqual(after.slice(i,i+4),before.slice(i,i+4));else if(after[i]!==before[i])changes++}assert(changes>100)}});
test('protected text and dimensions restored exactly',()=>{const c=createCanvas(300,200),g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,300,200);g.fillStyle='black';g.font='16px Arial';g.fillText('FAMILY 3.6 x 4.0m',30,50);const next=createCanvas(300,200),n=next.getContext('2d');n.drawImage(c,0,0);n.fillStyle='#ddd';n.fillRect(20,20,240,80);protectTextPixels(n,c,[{x:28,y:30,w:180,h:25}],{x:20,y:20,w:240,h:80});assert.deepEqual(n.getImageData(28,30,180,25).data,g.getImageData(28,30,180,25).data)});
test('placement avoids labels and footer contracts reject unsafe AI edits',()=>{const r=chooseFixtureRect({x:10,y:10,w:200,h:200},'bbq',[{x:70,y:70,w:80,h:80}],1000,700,'left wall');assert(r.x<70);const op={type:'fixture',labelId:'',text:'',fixture:'bbq',rect:{x:20,y:20,w:40,h:30}};assert(validatePlan({message:'',operations:[op]},1000,700));assert.throws(()=>validatePlan({message:'',operations:[{...op,rect:{x:20,y:690,w:40,h:30}}]},1000,700));assert.throws(()=>validatePlan({message:'',operations:[op]},1000,700,{x:500,y:500,w:100,h:100}));assert.equal(textBoxes('header\n5\t1\t1\t1\t1\t1\t10\t20\t30\t40\t90\t3.6').length,1)});
test('AI is honestly unavailable without a server credential; cross-origin blocked',async()=>{const status=await worker.fetch(new Request('https://test/api/status'),{});assert.equal((await status.json()).aiReady,false);const r=await worker.fetch(new Request('https://test/api/plan',{method:'POST',headers:{Origin:'https://test'}}),{});assert.equal(r.status,503);assert.equal((await r.json()).code,'AI_NOT_CONFIGURED');assert.equal((await worker.fetch(new Request('https://test/api/plan',{method:'POST',headers:{Origin:'https://other'}}),{})).status,403)});
