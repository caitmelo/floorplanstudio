import {sourceCrop,removeOuterFrames} from './source-cleanup.mjs';
import {splitInstructions,parseFixture,validatePlan} from './hybrid-contract.mjs';
import {chooseFixtureRect,drawFixture,protectTextPixels,textBoxes} from './fixtures.mjs';
import {PAGE,FOOTER,pageFit,drawFooter,assertOutsideFooter,isSourceDisclaimer,footerTop} from './page-template.mjs';
import {parseAction,brandCandidates,directionOf,overlaps,transformedRect} from './design-actions.mjs';
import {parseRevision,findLabel,labelsFromTSV,fitA4,textMask,tightenLabel,normalize} from './editor-core.mjs';
const $=id=>document.getElementById(id),canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
let portrait=false,colour=false;let pendingQuestion=null;let textRegions=[];let sourceImage=null,img=null,labels=[],history=[],future=[],file=null,original=true,busy=false,ready=false,planId=null,selectedId=null,manual=null,worker=null,base=localStorage.getItem('floorplan-api')||'',objectUrl=null;
function status(s,error=false){$('status').textContent=s;$('startstatus').textContent=s;$('status').classList.toggle('error',error)}
function setBusy(value,message='Processing…'){busy=value;for(const id of ['landscape','portrait','greyscale','colour','aiedit','elementaction','applytool','generate','apply','sample','upload','export','source','result','settings','undo','redo','clearinstruction','page'])if($(id))$(id).disabled=value;$('generate').textContent=value?message:'Recreate floorplan ↗';$('apply').textContent=value?'Working…':'Submit revision';$('undo').disabled=value||!history.length;$('redo').disabled=value||!future.length;$('progress').hidden=!value;$('canvas').style.cursor=value?'wait':'crosshair';$('startupload').disabled=value;$('newupload').disabled=value;$('instruction').disabled=value;}
function makeCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
async function imageFrom(url){return new Promise((resolve,reject)=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Could not load this image. Try a PNG or JPG file.'));im.src=url})}
function render(){const shown=original?sourceImage:img;if(!shown)return;canvas.width=shown.naturalWidth||shown.width;canvas.height=shown.naturalHeight||shown.height;ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(shown,0,0);if(!original)for(const l of labels.filter(l=>l.changed)){ctx.fillStyle=l.bg||'#fff';const erase=l.eraseRect||l;ctx.fillRect(erase.x,erase.y,erase.w,erase.h);ctx.fillStyle=l.color||'#111';const size=l.fontSize||l.h*.85;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`${size}px Arial`;ctx.fillText(l.text,l.x+l.w/2,l.y+l.h/2)}if(!original)drawFooter(ctx,canvas.width,canvas.height);$('undo').disabled=busy||!history.length;$('redo').disabled=busy||!future.length;$('version').textContent=`Revision ${history.length}`;$('source').classList.toggle('active',original);$('result').classList.toggle('active',!original);showSelection();renderComparison();}
function showSelection(rect){const l=rect||manual||labels.find(l=>l.id===selectedId),el=$('selection');el.hidden=original||!l;if(el.hidden)return;Object.assign(el.style,{left:l.x/canvas.width*100+'%',top:l.y/canvas.height*100+'%',width:l.w/canvas.width*100+'%',height:l.h/canvas.height*100+'%'});}
function listLabels(){const box=$('labels');box.replaceChildren();$('labelcount').textContent=`Detected labels (${labels.length})`;for(const l of labels){const b=document.createElement('button');b.type='button';b.textContent=l.text;b.title=`${l.confidence??'Manual'}${l.confidence!=null?'% OCR confidence':''} · click to select`;b.classList.toggle('chosen',l.id===selectedId);b.onclick=()=>select(l);box.append(b)}}
function select(l){if(busy)return;selectedId=l.id;manual=null;original=false;render();listLabels();status(`Selected “${l.text}”. Type your revision below.`);$('newname').value='';$('selectedname').textContent=l.text;$('quickedit').hidden=true;}
function reset(){portrait=false;colour=false;updateFormatButtons();pendingQuestion=null;textRegions=[];$('cleanupstatus').textContent='Branding cleanup runs when the plan is processed.';labels=[];history=[];future=[];planId=null;ready=false;selectedId=null;manual=null;original=true;$('history').textContent='';$('quickedit').hidden=true;listLabels();}
async function sample(){if(busy)return;setBusy(true,'Loading sample…');try{file=null;reset();sourceImage=await imageFrom('sample.png');img=sourceImage;$('filename').textContent=$('title').textContent='3 Peake Parade, Peakhurst';$('filemeta').textContent='Sample source · ready for OCR';$('badge').textContent='Ready to recreate';$('caption').textContent='Original sample · click Recreate to process it';$('pages').hidden=true;render();status('Click Recreate floorplan. OCR and revisions now run here without an API.')}catch(e){status(e.message,true)}finally{setBusy(false)}}
let pdfDocument=null;
async function pdfPage(n){const page=await pdfDocument.getPage(n),v=page.getViewport({scale:1}),scale=Math.min(2600/v.width,2200/v.height),viewport=page.getViewport({scale});const c=makeCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));await page.render({canvasContext:c.getContext('2d'),viewport}).promise;sourceImage=await imageFrom(c.toDataURL());img=sourceImage;reset();render();status(`PDF page ${n} loaded. Click Recreate to process this page.`)}
async function upload(f){if(!f||busy)return;if(f.size>20*1024*1024)return status('Choose a file smaller than 20 MB.',true);if(!['image/png','image/jpeg','image/gif','application/pdf'].includes(f.type))return status('Choose a PNG, JPG, GIF or PDF.',true);const previous={snapshot:snapshot(),history:history.slice(),future:future.slice(),sourceImage,img,ready,original,file,manual,selectedId,title:$('title').textContent,filename:$('filename').textContent,filemeta:$('filemeta').textContent,welcome:$('welcome').hidden,editor:$('editor').hidden};setBusy(true,'Loading file…');try{if(objectUrl)URL.revokeObjectURL(objectUrl);file=f;reset();$('filename').textContent=$('title').textContent=f.name;$('filemeta').textContent=`${(f.size/1024/1024).toFixed(1)} MB · built-in edits run in this browser`;$('badge').textContent='Ready to recreate';$('caption').textContent='Original file';$('pages').hidden=true;if(f.type==='application/pdf'){status('Opening PDF…');const pdf=await import('./vendor/pdf.mjs');pdf.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.mjs',import.meta.url).href;if(pdfDocument)await pdfDocument.destroy();pdfDocument=await pdf.getDocument({data:await f.arrayBuffer(),isEvalSupported:false}).promise;$('page').replaceChildren(...Array.from({length:pdfDocument.numPages},(_,i)=>{const o=document.createElement('option');o.value=i+1;o.textContent=`Page ${i+1}`;return o}));$('pages').hidden=pdfDocument.numPages<2;await pdfPage(1)}else{objectUrl=URL.createObjectURL(f);sourceImage=await imageFrom(objectUrl);if(sourceImage.naturalWidth*sourceImage.naturalHeight>40000000)throw Error('This image is too large. Use an image under 40 megapixels.');img=sourceImage;render();}$('welcome').hidden=true;$('editor').hidden=false;if($('mode').value==='local')await localGenerate();else status('File loaded. Click Recreate to send it to your API.')}catch(e){history=previous.history;future=previous.future;sourceImage=previous.sourceImage;ready=previous.ready;file=previous.file;restoreRevision(previous.snapshot);original=previous.original;manual=previous.manual;selectedId=previous.selectedId;$('title').textContent=previous.title;$('filename').textContent=previous.filename;$('filemeta').textContent=previous.filemeta;$('welcome').hidden=previous.welcome;$('editor').hidden=previous.editor;render();status(e.message,true)}finally{setBusy(false);$('upload').value='';$('startupload').value='';$('newupload').value=''}}
async function getWorker(){if(worker)return worker;status('Loading the built-in OCR engine…');worker=await Tesseract.createWorker('eng',1,{workerPath:new URL('./vendor/worker.min.js',import.meta.url).href,corePath:new URL('./vendor/tesseract-core-lstm.wasm.js',import.meta.url).href,langPath:new URL('./vendor',import.meta.url).href,cacheMethod:'none',logger:m=>{if(busy&&m.status==='recognizing text'){const p=Math.round(m.progress*100);$('progress').value=p;status(`Reading labels… ${p}%`)}}});await worker.setParameters({tessedit_pageseg_mode:'11',user_defined_dpi:'300'});return worker}
function monochrome(source,retainColour=false){const sw=source.naturalWidth||source.width,sh=source.naturalHeight||source.height,scan=makeCanvas(sw,sh),sg=scan.getContext('2d');sg.drawImage(source,0,0);const crop=sourceCrop(sg.getImageData(0,0,sw,sh).data,sw,sh);const f=pageFit(crop.w,crop.h),c=makeCanvas(f.w,f.h),g=c.getContext('2d',{willReadFrequently:true});g.fillStyle='white';g.fillRect(0,0,f.w,f.h);g.drawImage(source,crop.x,crop.y,crop.w,crop.h,f.x,f.y,crop.w*f.scale,crop.h*f.scale);const pixels=g.getImageData(0,0,c.width,c.height);if(!retainColour)for(let i=0;i<pixels.data.length;i+=4){const v=Math.max(0,Math.min(255,(.2126*pixels.data[i]+.7152*pixels.data[i+1]+.0722*pixels.data[i+2]-128)*1.08+128));pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;pixels.data[i+3]=255}g.putImageData(pixels,0,0);return c}
function sampleBackground(l){const g=img.getContext?img.getContext('2d',{willReadFrequently:true}):null;if(!g)return '#fff';const a=g.getImageData(Math.max(0,Math.floor(l.x)),Math.max(0,Math.floor(l.y)),Math.max(1,Math.min(img.width-Math.floor(l.x),Math.ceil(l.w))),Math.max(1,Math.min(img.height-Math.floor(l.y),Math.ceil(l.h)))).data;const bins=new Uint32Array(256);for(let i=0;i<a.length;i+=4)bins[a[i]]++;let best=255;for(let i=80;i<256;i++)if(bins[i]>bins[best])best=i;return `rgb(${best},${best},${best})`}
async function localGenerate(){planId=null;img=monochrome(sourceImage,true);const frameContext=img.getContext('2d'),framePixels=frameContext.getImageData(0,0,img.width,img.height);const frameScan=monochrome(sourceImage),frameData=frameScan.getContext('2d').getImageData(0,0,img.width,img.height),beforeFrames=frameData.data.slice();removeOuterFrames(frameData.data,img.width,img.height);for(let i=0;i<frameData.data.length;i+=4)if(beforeFrames[i]!==frameData.data[i])framePixels.data[i]=framePixels.data[i+1]=framePixels.data[i+2]=255;frameContext.putImageData(framePixels,0,0);labels=[];history=[];future=[];original=false;selectedId=null;manual=null;ready=true;render();$('badge').textContent='Monochrome preview';$('caption').textContent='A4 monochrome · original geometry retained';try{const w=await getWorker();status('Reading the original text at higher resolution…');const scanScale=2,scan=makeCanvas(img.width*scanScale,img.height*scanScale);scan.getContext('2d').drawImage(img,0,0,scan.width,scan.height);const result=await w.recognize(scan,{}, {text:true,tsv:true,blocks:false,hocr:false});const rescale=l=>({...l,x:l.x/scanScale,y:l.y/scanScale,w:l.w/scanScale,h:l.h/scanScale,...(l.fontSize?{fontSize:l.fontSize/scanScale}:{})});textRegions=textBoxes(result.data.tsv).map(rescale);labels=labelsFromTSV(result.data.tsv,scan.width,scan.height).map(rescale);const originalPixels=img.getContext('2d').getImageData(0,0,img.width,img.height).data;for(const l of labels){if(!isSourceDisclaimer(l,img.height))tightenLabel(l,originalPixels,img.width,img.height);l.bg=sampleBackground(l);}await readSourceDisclaimer(w);listLabels();autoCleanup();await cleanLogos();status(`Standard footer applied. Preview ready. ${labels.length} text labels detected. ${$('cleanupstatus').textContent} Type your change below and submit it.`)}catch(e){status('Monochrome preview is ready, but OCR could not finish. Drag a tight box around a room label, then type its new name. You can retry Recreate.',true);if(worker){await worker.terminate().catch(()=>{});worker=null}autoCleanup();}render();}
async function request(path,options){const r=await fetch(base.replace(/\/$/,'')+path,{...options,credentials:'include',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error(`Your conversion API returned ${r.status}. Switch to built-in mode to test without it.`);return r.json()}
function validate(d){if(!d||typeof d.id!=='string'||typeof d.imageUrl!=='string'||!Array.isArray(d.labels))throw Error('Unexpected API response.');const u=new URL(d.imageUrl,location.href);if(!['https:','http:'].includes(u.protocol))throw Error('Invalid preview URL.');for(const l of d.labels)if(typeof l.id!=='string'||typeof l.text!=='string'||!['x','y','w','h'].every(k=>Number.isFinite(l[k]))||l.w<=0||l.h<=0)throw Error('Invalid label coordinates.');return d}
async function generate(){if(busy||!sourceImage)return;setBusy(true);$('quickedit').hidden=true;try{if($('mode').value==='local'){await localGenerate()}else{if(!base)throw Error('Add an API endpoint in API connection, or choose Built-in processing.');status('Sending floorplan to your API…');const form=new FormData();form.append('file',file||await(await fetch('sample.png')).blob(),file?.name||'sample.png');form.append('style',JSON.stringify({id:'classic-monochrome-v1',page:'A4',orientation:'landscape',font:'Arial',footer:'standard',layout:'best-fit'}));const d=validate(await request('',{method:'POST',body:form}));const apiImage=await imageFrom(d.imageUrl),placement=pageFit(apiImage.naturalWidth,apiImage.naturalHeight);img=monochrome(apiImage);labels=d.labels.map(l=>({...l,x:l.x*placement.scale+placement.x,y:l.y*placement.scale+placement.y,w:l.w*placement.scale,h:l.h*placement.scale,fontSize:(l.fontSize||l.h)*placement.scale}));autoCleanup();planId=d.id;history=[];future=[];ready=true;original=false;render();listLabels();$('badge').textContent='API preview';status('Preview ready. Review the drawing before exporting.')}return true}catch(e){status(e.message,true);return false}finally{setBusy(false)}}
function recordSnapshot(){history.push(snapshot());future=[];}
function restoreRevision(p){portrait=!!p.portrait;colour=!!p.colour;updateFormatButtons();textRegions=p.textRegions||[];labels=structuredClone(p.labels);img=p.img;planId=p.planId;$('cleanupstatus').textContent=p.cleanup||'';original=false;selectedId=null;manual=null;$('quickedit').hidden=true;render();listLabels();}
function snapshot(){return {portrait,colour,textRegions:structuredClone(textRegions),labels:structuredClone(labels),img,planId,cleanup:$('cleanupstatus').textContent}}
function textAppearance(rect){
 const pixels=img.getContext?img.getContext('2d').getImageData(0,0,img.width,img.height):null;if(!pixels)return {fontSize:rect.fontSize||rect.h*.85,color:'#111'};
 const bg=sampleBackground(rect),bgValue=Number(bg.match(/\d+/)?.[0]||255);let minY=Infinity,maxY=-1,darkest=255,color='#111';
 for(let y=Math.max(0,Math.floor(rect.y));y<Math.min(img.height,Math.ceil(rect.y+rect.h));y++)for(let x=Math.max(0,Math.floor(rect.x));x<Math.min(img.width,Math.ceil(rect.x+rect.w));x++){
 const i=(y*img.width+x)*4,v=pixels.data[i];if(v<bgValue-45){minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(v<darkest){darkest=v;color='rgb('+pixels.data[i]+','+pixels.data[i+1]+','+pixels.data[i+2]+')';}}
 }
 return {fontSize:rect.fontSize&&!rect.manual?rect.fontSize:maxY>=minY?(maxY-minY+1)/.73:rect.h*.85,color};
}
function applyLocal(l,text){
 assertOutsideFooter(l,img.height||img.naturalHeight);if(!text.trim()||text.length>60)throw Error('Enter text between 1 and 60 characters.');
 // A drawn selection identifies existing text; it does not define a new font size.
 if(l.manual){let matches=labels.filter(a=>a.x+a.w/2>=l.x&&a.x+a.w/2<=l.x+l.w&&a.y+a.h/2>=l.y&&a.y+a.h/2<=l.y+l.h);if(matches.length>1){const isDimension=t=>/\d\s*(?:[.,]\d+)?\s*(?:mm|cm|m|ft)?\s*[x×]\s*\d/i.test(t);const relevant=matches.filter(a=>isDimension(a.text)===isDimension(text));if(relevant.length===1)matches=relevant;else if(!isDimension(text)){const words=relevant.filter(a=>/[a-z]{2}/i.test(a.text));if(words.length===1)matches=words;}}if(matches.length>1)throw Error('Select just one label or measurement to replace. Nothing was changed.');if(matches.length===1)l=matches[0];}
 const appearance=textAppearance(l);
 if(l.manual){const pixels=img.getContext('2d').getImageData(Math.max(0,Math.floor(l.x)),Math.max(0,Math.floor(l.y)),Math.ceil(l.w),Math.ceil(l.h)).data;const bg=Number(sampleBackground(l).match(/\d+/)?.[0]||255);let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<bg-45)ink++;if(ink<3)throw Error('No text was found in this selection. Use Add text for a blank area. Nothing was changed.');}
 const fontSize=l.changed&&l.fontSize?l.fontSize:appearance.fontSize;ctx.font=fontSize+'px Arial';const newWidth=Math.max(l.w,ctx.measureText(text.trim()).width+4),newX=l.x+l.w/2-newWidth/2;
 if(newX<0||newX+newWidth>img.width)throw Error('The replacement would run off the page. Use shorter wording. Nothing was changed.');
 if(labels.some(other=>other.id!==l.id&&overlaps({x:newX,y:l.y,w:newWidth,h:l.h},other)&&!overlaps(l,other)))throw Error('The replacement would overlap another label. Use shorter wording. Nothing was changed.');
 const edgePixels=img.getContext('2d').getImageData(0,0,img.width,img.height).data;let darkOutside=0;
 for(let y=Math.max(0,Math.floor(l.y));y<Math.min(img.height,Math.ceil(l.y+l.h));y++)for(let x=Math.max(0,Math.floor(newX));x<Math.min(img.width,Math.ceil(newX+newWidth));x++){if(x>=l.x-2&&x<=l.x+l.w+2)continue;if(edgePixels[(y*img.width+x)*4]<90)darkOutside++;}
 if(darkOutside>4)throw Error('The replacement would overlap drawing lines. Use shorter wording. Nothing was changed.');
 recordSnapshot();
 if(l.manual&&!labels.includes(l)){l={...l,id:'manual-'+Date.now(),text:'Selected text',bg:sampleBackground(l)};labels.push(l);}
 l.fontSize=l.changed&&l.fontSize?l.fontSize:appearance.fontSize;l.color=l.color||appearance.color;
 const old=l.eraseRect||{x:l.x,y:l.y,w:l.w,h:l.h},center=l.x+l.w/2;
 ctx.font=l.fontSize+'px Arial';const width=Math.max(l.w,ctx.measureText(text.trim()).width+4);
 l.x=center-width/2;l.w=width;l.eraseRect={x:Math.min(old.x,l.x),y:old.y,w:Math.max(old.x+old.w,l.x+l.w)-Math.min(old.x,l.x),h:old.h};
 l.text=text.trim();l.changed=true;selectedId=null;manual=null;original=false;render();listLabels();$('selectedname').textContent=l.text;$('quickedit').hidden=true;status('Text updated in place, keeping its size and colour.');$('history').textContent='Latest change: '+l.text;return {revision:history.length,label:l.text};
}

async function revise(instruction){
 if(busy)throw Error('Please wait for the current revision to finish.');
 if(typeof instruction!=='string'||!instruction.trim())throw Error('Type the revision you want, then submit it.');if(instruction.length>4000)throw Error('Keep the revision under 4,000 characters.');if(pendingQuestion){instruction=pendingQuestion.instruction+'\nClarification question: '+pendingQuestion.question+'\nUser answer: '+instruction;pendingQuestion=null;}
 if(!ready){await generate();if(!ready)throw Error('Upload a floorplan first.');}
 const beginning=snapshot(),priorHistory=history.slice(),priorFuture=future.slice(),selection=manual?{...manual}:null;
 function restore(){textRegions=structuredClone(beginning.textRegions||[]);labels=structuredClone(beginning.labels);img=beginning.img;planId=beginning.planId;history=priorHistory.slice();future=priorFuture.slice();manual=selection;selectedId=null;original=false;render();listLabels();}
 if(/^(?:please\s+)?(?:number|renumber)\s+(?:(?:all|the)\s+)*(?:beds|bedrooms)(?:\s+from\s+1)?[.!]?$/i.test(instruction.trim())){
  const beds=labels.filter(l=>/^(?:(?:main|master)\s+)?bed(?:room)?(?:\s*\d+)?$/i.test(l.text.trim())&&(!selection||(l.x+l.w/2>=selection.x&&l.x+l.w/2<=selection.x+selection.w&&l.y+l.h/2>=selection.y&&l.y+l.h/2<=selection.y+selection.h))).sort((a,b)=>a.y-b.y||a.x-b.x);
  if(!beds.length)throw Error(selection?'No bedroom labels were found inside your selection.':'No bedroom labels were found on this plan.');
  // Group labels on the same visual row, then number from left to right.
  const rows=[];for(const bed of beds){const row=rows[rows.length-1];if(row&&Math.abs(bed.y-row.y)<=Math.min(bed.h,row.h)*.6)row.items.push(bed);else rows.push({y:bed.y,h:bed.h,items:[bed]});}
  const ordered=rows.flatMap(row=>row.items.sort((a,b)=>a.x-b.x));
  if(ordered.every((l,i)=>l.text==='BED '+(i+1))){status('Bedroom labels are already numbered in this order.');return;}
  try{for(const [i,l] of ordered.entries())applyLocal(l,'BED '+(i+1));history=[...priorHistory,beginning];future=[];manual=null;selectedId=null;original=false;render();listLabels();status('Numbered '+ordered.length+' bedrooms from top to bottom, left to right'+(selection?' within your selection':'')+'. Undo restores them all.');return {revision:history.length,actions:ordered.length};}catch(error){restore();throw error;}
 }
 if(selection&&/^(?:please\s+)?(?:remove|delete|erase|clear)\s+(?:all\s+)?(?:text\s+and\s+(?:icons|symbols)|everything|all\s+content)(?:\s+(?:here|in (?:this|the selected) area))?[.!]?$/i.test(instruction.trim())){
  const current=flattened(),r={x:Math.floor(selection.x),y:Math.floor(selection.y),w:Math.ceil(selection.w),h:Math.ceil(selection.h)};assertOutsideFooter(r,current.height);
  const next=makeCanvas(current.width,current.height),g=next.getContext('2d');g.drawImage(current,0,0);g.fillStyle=surroundingBackground(current,r);g.fillRect(r.x,r.y,r.w,r.h);
  recordSnapshot();img=next;labels=labels.filter(l=>!overlaps(l,r)).map(l=>({...l,changed:false}));textRegions=textRegions.filter(l=>!overlaps(l,r));manual=null;selectedId=null;original=false;render();listLabels();status('Removed all text and icons inside your selection. Everything outside it was retained.');return;
 }
 if(/^(?:please\s+)?(?:remove|delete|erase)\b/i.test(instruction)&&/\bfans?\b/i.test(instruction)&&/\bbedrooms?\b/i.test(instruction))return reviseBedroomFans(instruction,selection);
 let actions;
 try{actions=splitInstructions(instruction).map(part=>parseFixture(part)||parseAction(part));}catch{actions=null;}
 const selectedLabels=selection?labels.filter(l=>l.x+l.w/2>=selection.x&&l.x+l.w/2<=selection.x+selection.w&&l.y+l.h/2>=selection.y&&l.y+l.h/2<=selection.y+selection.h):[];
 const mapSelectedText=selectedLabels.length>1&&(!actions||actions.length>1)&&(/\b(?:rename|relabel|call|name|label|measurement|dimension|size|text|update|change|replace|set)\b/i.test(instruction))&&!/\b(?:add|remove|delete|erase|move|rotate|draw|insert)\b/i.test(instruction);
 if(mapSelectedText)actions=null;
 // Named text is resolved independently; one box must not be reused for unrelated graphic requests.
 if(actions&&actions.filter(a=>a.type!=='rename').length>1)actions=null;
 if($('aiedit')?.checked&&actions?.length===1&&actions[0].type==='fixture'){const rect=await locateImageEdit(instruction,selection);const result=applyFixtureAction({...actions[0],rect});future=[];render();status('Added '+actions[0].fixture.toUpperCase()+'. AI chose the position; existing text and the rest of the drawing were preserved.');return result;}
 if(!mapSelectedText&&$('aiedit')?.checked&&!(actions&&actions.every(a=>a.type==='rename'||a.type==='text')))return reviseWithImageAI(instruction,selection);
 if(actions){
  try{
   for(const action of actions){
    manual=selection?{...selection}:null;
    if(action.type==='remove')await scanRemovalText(targetFor(action));
    if(action.type==='rename'&&!/^(this|selected(?: text| label| room| element)?)$/i.test(action.from)&&!labels.some(l=>normalize(l.text)===normalize(action.from))){joinNamedLabel(action.from);if(!labels.some(l=>normalize(l.text)===normalize(action.from)))await rereadLabel(action.from);joinNamedLabel(action.from);}
    if(action.type==='fixture'){manual=selection;applyFixtureAction(action)}else executeDesignAction(action);
   }
   history=[...priorHistory,beginning];future=[];manual=null;selectedId=null;original=false;render();listLabels();status(`Applied ${actions.length} revision${actions.length===1?'':'s'}. Existing text outside explicit text edits was preserved.`);return {revision:history.length,actions:actions.length};
  }catch(error){restore();if(/too small|clear space|protected footer|off the page|Nothing was changed/.test(error.message))throw error;}
 }
 setBusy(true);status('Interpreting your revision…');
 try{
  const current=flattened(),preview=makeCanvas(Math.min(1800,current.width),Math.round(current.height*Math.min(1800,current.width)/current.width));preview.getContext('2d').drawImage(current,0,0,preview.width,preview.height);
  const r=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instruction:mapSelectedText?'Match every requested text change to the appropriate existing label inside the selection. Distinguish room names from dimensions and use position and existing values to resolve each reference. Return rename operations only, each with its exact supplied label ID. Preserve wording not requested for change. If any requested change is ambiguous or cannot be mapped, return zero operations and ask one concise question. User request: '+instruction:instruction,width:current.width,height:current.height,selection,labels:(mapSelectedText?selectedLabels:labels).map(({id,text,x,y,w,h})=>({id,text,x,y,w,h})),image:preview.toDataURL('image/png')}),signal:AbortSignal.timeout(100000)});
  let data;try{data=await r.json()}catch{throw Error('The AI interpreter is unavailable. Nothing was changed.');}if(!r.ok)throw Error(data.message||'The AI request failed. Nothing was changed.');
  const plan=validatePlan(data,current.width,current.height,selection);
  if(mapSelectedText){const ids=new Set();for(const op of plan.operations){if(op.type!=='rename'||!selectedLabels.some(l=>l.id===op.labelId)||ids.has(op.labelId))throw Error('The requested text changes could not be matched reliably. Nothing was changed.');ids.add(op.labelId);}}
  if(!plan.operations.length){restore();pendingQuestion={instruction,question:plan.message};$('instruction').value='';status((plan.message||'Please describe the target more precisely.')+' Reply in the instruction box and submit. No changes have been made.');return {revision:history.length,question:plan.message};}
  for(const op of plan.operations){
   if(op.type==='rename'){const l=labels.find(l=>l.id===op.labelId);if(!l)throw Error('The AI referred to an unknown label. Nothing was changed.');applyLocal(l,op.text);}
   else if(op.type==='fixture')applyFixtureAction({type:'fixture',fixture:op.fixture,rect:op.rect});
   else{await scanRemovalText(op.rect);manual={...op.rect,manual:true,userSelected:true};executeDesignAction({type:'remove',target:'selected element'});}
  }
  history=[...priorHistory,beginning];future=[];manual=null;selectedId=null;render();listLabels();status(`Applied ${plan.operations.length} revision${plan.operations.length===1?'':'s'}. Text and the footer were preserved.`);return {revision:history.length,actions:plan.operations.length};
 }catch(error){restore();throw error}finally{setBusy(false)}
}
function applyFixtureAction(action){
 const area=action.rect||manual;if(!area)throw Error('Fixture location needs visual interpretation.');
 assertOutsideFooter(area,img.height||img.naturalHeight);
 const current=flattened(),pixels=current.getContext('2d').getImageData(0,0,current.width,current.height).data;
 const r=action.rect||chooseFixtureRect(area,action.fixture,[...labels,...textRegions],current.width,current.height,action.instruction||'',pixels);
 assertOutsideFooter(r,current.height);
 if(action.rect&&[...labels,...textRegions].some(l=>overlaps(l,r)))throw Error('The proposed fixture would cover existing text. Nothing was changed.');
 const next=makeCanvas(current.width,current.height),g=next.getContext('2d');g.drawImage(current,0,0);drawFixture(g,r,action.fixture);protectTextPixels(g,current,[...labels,...textRegions],r);drawFooter(g,current.width,current.height);
 history.push(snapshot());img=next;labels=labels.map(l=>({...l,changed:false}));manual=null;selectedId=null;render();return {fixture:action.fixture,rect:r};
}
function joinNamedLabel(name){
 const wanted=normalize(name),matches=[];
 for(const first of labels){
  const parts=[first];let text=normalize(first.text),last=first;
  if(!wanted.startsWith(text+' '))continue;
  while(text!==wanted&&parts.length<4){
   const candidates=labels.filter(l=>!parts.includes(l)&&l.y>=last.y+last.h-2&&l.y-(last.y+last.h)<Math.max(last.h,l.h)*1.2&&Math.abs(l.x+l.w/2-(first.x+first.w/2))<Math.max(first.w,l.w)*.3&&wanted.startsWith(text+' '+normalize(l.text)));
   if(candidates.length!==1)break;
   last=candidates[0];parts.push(last);text+=' '+normalize(last.text);
  }
  if(text===wanted)matches.push(parts);
 }
 if(matches.length!==1)return;
 const parts=matches[0],x=Math.min(...parts.map(l=>l.x)),y=Math.min(...parts.map(l=>l.y)),right=Math.max(...parts.map(l=>l.x+l.w)),bottom=Math.max(...parts.map(l=>l.y+l.h));
 const joined={...parts[0],id:'joined-'+parts.map(l=>l.id).join('-'),text:name,x,y,w:right-x,h:bottom-y,eraseRect:{x,y,w:right-x,h:bottom-y}};
 labels=labels.filter(l=>!parts.includes(l)&&!(l.x>=x-2&&l.y>=y-2&&l.x+l.w<=right+2&&l.y+l.h<=bottom+2));labels.push(joined);
}
async function rereadLabel(name){
 setBusy(true);try{status(`Looking more closely for “${name}”…`);const w=await getWorker(),src=flattened(),found=[];
 for(let row=0;row<2;row++)for(let col=0;col<2;col++){
 const x=Math.max(0,Math.floor(col*src.width/2)-30),y=Math.max(0,Math.floor(row*src.height/2)-30),cw=Math.min(Math.ceil(src.width/2)+60,src.width-x),ch=Math.min(Math.ceil(src.height/2)+60,src.height-y),scale=1.6,c=makeCanvas(Math.round(cw*scale),Math.round(ch*scale));c.getContext('2d').drawImage(src,x,y,cw,ch,0,0,c.width,c.height);
 const result=await w.recognize(c,{}, {text:true,tsv:true,blocks:false,hocr:false});
 for(const l of labelsFromTSV(result.data.tsv,c.width,c.height)){if(normalize(l.text)!==normalize(name)&&!(' '+normalize(name)+' ').includes(' '+normalize(l.text)+' '))continue;const r={...l,id:'reread-'+Date.now()+'-'+found.length,x:l.x/scale+x,y:l.y/scale+y,w:l.w/scale,h:l.h/scale,fontSize:l.fontSize/scale};if(found.some(a=>overlaps(a,r)))continue;found.push(r);}
 }
 const pixels=src.getContext('2d').getImageData(0,0,src.width,src.height).data;for(const l of found){tightenLabel(l,pixels,src.width,src.height);l.bg=sampleBackground(l);if(!labels.some(existing=>normalize(existing.text)===normalize(l.text)&&overlaps(existing,l)))labels.push(l)}listLabels();
 }finally{setBusy(false)}
}
function targetFor(action){
 const picked=manual||labels.find(l=>l.id===selectedId);if(picked&&(/^(?:the )?(?:this|selected)(?: element| region| text| label)?$/i.test(action.target||'')||manual?.userSelected))return picked;
 if(['text','wall','line','door','window'].includes(action.type)&&picked)return picked;if(['text','wall','line','door','window'].includes(action.type))throw Error('Drag a rectangle on the editable preview to show where the new element should go, then apply again.');
 const target=(action.target||'').replace(/^(the|a)\s+/i,'').replace(/['"]/g,'').trim();
 if(/watermark|brand|logo/i.test(target)){const d=directionOf(target),candidates=brandCandidates(labels,canvas.width,canvas.height).filter(l=>(!d.right||l.x>canvas.width/2)&&(!d.left||l.x<canvas.width/2)&&(!d.top||l.y<canvas.height/2)&&(!d.bottom||l.y>canvas.height/2));if(candidates.length===1)return candidates[0];throw Error('Select the watermark or logo by dragging a tight box around it on the editable preview, then click Apply revision again. Its exact boundary could not be identified reliably.');}
 try{return findLabel(labels,target,selectedId)}catch{throw Error('Select the element by dragging a box around it on the editable preview, then click Apply revision again.');}
}
function flattened(){original=false;render();const c=makeCanvas(canvas.width,canvas.height);c.getContext('2d').drawImage(canvas,0,0);return c;}
function executeDesignAction(action){
 if(action.type==='rename'){const explicit=/^(this|selected(?: text| label| room| element)?)$/i.test(action.from);const l=explicit?(manual||labels.find(l=>l.id===selectedId)):findLabel(labels,action.from,selectedId);if(!l)throw Error('Which label should change? Click it on the plan, then submit again.');return applyLocal(l,action.to)}
 const target=targetFor(action),r={x:Math.floor(target.x),y:Math.floor(target.y),w:Math.max(1,Math.ceil(target.w)),h:Math.max(1,Math.ceil(target.h))};
 const current=flattened(),dest=transformedRect(r,action,current.width,current.height),next=makeCanvas(current.width,current.height),g=next.getContext('2d');g.drawImage(current,0,0);
 assertOutsideFooter(r,current.height);assertOutsideFooter(dest,current.height);const bg=surroundingBackground(current,r);let updated=labels.map(l=>({...l,changed:false}));
 const changing=['remove','fill','move','resize','rotate'].includes(action.type);
 if(changing){g.fillStyle=action.type==='fill'?action.color:bg;g.fillRect(r.x,r.y,r.w,r.h);updated=updated.filter(l=>!overlaps(l,r));}
 if(['move','resize','rotate'].includes(action.type)){
  if(action.type==='rotate'){g.save();g.translate(dest.x+dest.w/2,dest.y+dest.h/2);g.rotate(action.angle*Math.PI/180);g.drawImage(current,r.x,r.y,r.w,r.h,-r.w/2,-r.h/2,r.w,r.h);g.restore()}else g.drawImage(current,r.x,r.y,r.w,r.h,dest.x,dest.y,dest.w,dest.h);
  updated=updated.filter(l=>!overlaps(l,dest));
 }
 if(action.type==='text'){if([...labels,...textRegions].some(l=>overlaps(l,r)))throw Error('New text would overlap existing text. Select an empty area. Nothing was changed.');if(!action.text.trim()||action.text.length>120)throw Error('Keep added text between 1 and 120 characters.');let size=Math.min(r.h*.8,40);g.fillStyle='#111';g.textAlign='center';g.textBaseline='middle';g.font=`${size}px Arial`;while(g.measureText(action.text).width>r.w&&size>4){size-=.5;g.font=`${size}px Arial`}g.fillText(action.text,r.x+r.w/2,r.y+r.h/2);updated.push({...r,id:'added-'+Date.now(),text:action.text,fontSize:size,bg,confidence:100});}
 if(['wall','line','window','door'].includes(action.type)){
  g.strokeStyle='#111';g.fillStyle='#111';g.lineWidth=action.type==='wall'?Math.max(3,current.width/260):Math.max(1,current.width/1000);
  const horizontal=r.w>=r.h,cx=r.x+r.w/2,cy=r.y+r.h/2;
  g.beginPath();if(action.type==='door'){const size=Math.min(r.w,r.h);g.moveTo(r.x,r.y+size);g.lineTo(r.x,r.y);g.lineTo(r.x+size,r.y);g.stroke();g.beginPath();g.lineWidth=Math.max(1,current.width/1600);g.arc(r.x,r.y,size,0,Math.PI/2);g.stroke();}
  else if(action.type==='window'){g.strokeRect(r.x,r.y,r.w,r.h);if(horizontal){g.moveTo(r.x,cy);g.lineTo(r.x+r.w,cy)}else{g.moveTo(cx,r.y);g.lineTo(cx,r.y+r.h)}g.stroke()}
  else{if(horizontal){g.moveTo(r.x,cy);g.lineTo(r.x+r.w,cy)}else{g.moveTo(cx,r.y);g.lineTo(cx,r.y+r.h)}g.stroke()}
 }
 const explicitTextRemoval=action.type==='remove'&&!manual&&labels.some(l=>l.id===target.id);if(!explicitTextRemoval&&action.type!=='text')protectTextPixels(g,current,[...labels,...textRegions],r);if(['move','resize','rotate'].includes(action.type))protectTextPixels(g,current,[...labels,...textRegions],dest);updated=[...labels.filter(l=>!explicitTextRemoval||l.id!==target.id).map(l=>({...l,changed:false})),...updated.filter(l=>l.id.startsWith('added-')&&!labels.some(old=>old.id===l.id))];history.push(snapshot());img=next;labels=updated;manual=null;selectedId=null;original=false;render();listLabels();$('history').textContent='Latest change: '+action.type;status(`Applied ${action.type}. You can undo this change above the preview.`);return {action:action.type,revision:history.length};
}
function autoCleanup(){
 const width=img.width||img.naturalWidth,height=img.height||img.naturalHeight;
 const disclaimers=labels.filter(l=>isSourceDisclaimer(l,height));
 const branding=brandCandidates(labels,width,height).filter(l=>l.automatic);
 const removed=[...disclaimers,...branding];
 const next=makeCanvas(width,height),g=next.getContext('2d');g.drawImage(img,0,0);
 for(const l of removed){g.fillStyle=sampleBackground(l);g.fillRect(Math.max(0,l.x-2),Math.max(0,l.y-2),Math.min(width-l.x,l.w+4),Math.min(height-l.y,l.h+4));}
 img=next;textRegions=textRegions.filter(l=>!removed.some(r=>overlaps(l,r))&&l.y+l.h<footerTop(height));labels=labels.filter(l=>!removed.some(r=>r.id===l.id)&&l.y+l.h<footerTop(height));drawFooter(g,width,height);listLabels();
 $('cleanupstatus').textContent=`Standard footer applied. ${disclaimers.length} source disclaimer text regions and ${branding.length} recognised branding regions removed.`;
}
async function cleanLogos(){
 status('Checking for logos and branding…');
 const current=flattened(),preview=makeCanvas(Math.min(1800,current.width),Math.round(current.height*Math.min(1800,current.width)/current.width));preview.getContext('2d').drawImage(current,0,0,preview.width,preview.height);
 try{
 const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instruction:'Remove every standalone agency, supplier or company logo and branding mark from this floorplan, including STONE and the entire outline or symbol around its letters. Return only remove operations with tight bounding rectangles around complete logos. Keep the property address, all room labels, dimensions, north arrow, drawing, walls and the standard bottom disclaimer. Do not remove ordinary text or objects. Only remove logos on a clear background separate from the drawing. If none are visible return no operations and say no standalone logos found.',width:current.width,height:current.height,labels:labels.map(({id,text,x,y,w,h})=>({id,text,x,y,w,h})),image:preview.toDataURL('image/png')}),signal:AbortSignal.timeout(100000)});
 const data=await response.json();if(!response.ok)throw Error(data.message||'Logo check unavailable.');
 const plan=validatePlan(data,current.width,current.height);if(plan.operations.some(op=>op.type!=='remove'))throw Error('Logo check returned an unexpected edit.');
 const next=makeCanvas(current.width,current.height),g=next.getContext('2d');g.drawImage(current,0,0);
 for(const {rect:r} of plan.operations){if(r.w*r.h>current.width*current.height*.08)throw Error('Logo area is too large to clear automatically.');g.fillStyle='#fff';g.fillRect(r.x,r.y,r.w,r.h);}
 img=next;labels=labels.filter(l=>!plan.operations.some(op=>overlaps(l,op.rect)));textRegions=textRegions.filter(l=>!plan.operations.some(op=>overlaps(l,op.rect)));drawFooter(g,current.width,current.height);listLabels();
 $('cleanupstatus').textContent+=' '+plan.operations.length+' complete logo regions removed.';
 }catch(error){$('cleanupstatus').textContent+=' Logo cleanup could not finish: '+error.message;}
}
$('applytool').onclick=async()=>{if(busy)return;try{if(!ready)await generate();if(!ready)return;const type=$('elementaction').value;let a={type,target:'selected element'};if(type==='text')a.text=$('toolvalue').value;else if(type==='move'){a.direction=$('direction').value;a.amount=Number($('toolvalue').value)||20;a.unit='px'}else if(type==='resize')a.scale=(Number($('toolvalue').value)||120)/100;else if(type==='rotate')a.angle=Number($('toolvalue').value)||90;else if(type==='fill')a.color=$('fillcolor').value;executeDesignAction(a)}catch(e){status(e.message,true)}};
$('elementaction').onchange=()=>{const type=$('elementaction').value;$('toolvalue').hidden=!['text','move','resize','rotate'].includes(type);$('direction').hidden=type!=='move';$('fillcolor').hidden=type!=='fill';$('toolvalue').value=type==='move'?'20':type==='resize'?'120':type==='rotate'?'90':'';$('toolvalue').placeholder=type==='text'?'Text to add':type==='resize'?'Scale percent':type==='rotate'?'Degrees':'Distance in pixels';};
function position(e){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(e.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-r.top)*canvas.height/r.height))}}
let start=null;
canvas.onpointerdown=e=>{if(busy||original||!ready)return;start=position(e);canvas.setPointerCapture(e.pointerId)};
canvas.onpointermove=e=>{if(!start)return;const p=position(e);showSelection({x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(start.x-p.x),h:Math.abs(start.y-p.y)})};
canvas.onpointerup=e=>{if(!start)return;const end=position(e),s=start;start=null;const rect={x:Math.min(s.x,end.x),y:Math.min(s.y,end.y),w:Math.abs(s.x-end.x),h:Math.abs(s.y-end.y)};if(rect.w<8||rect.h<8){const hits=labels.filter(l=>end.x>=l.x-5&&end.x<=l.x+l.w+5&&end.y>=l.y-5&&end.y<=l.y+l.h+5);if(hits.length){select(hits[0]);return}showSelection();status('Drag a rectangle around the element you want to edit.');return}manual={...rect,manual:true,userSelected:true,fontSize:rect.h*.75};selectedId=null;showSelection();$('selectedname').textContent='Selected element';$('newname').value='';$('quickedit').hidden=true;status('Area selected. Type your revision below—for example, add built-in BBQ in alfresco.');};canvas.onpointercancel=()=>{start=null;showSelection()};
$('quickform').onsubmit=e=>{e.preventDefault();if(busy)return;try{const l=manual||labels.find(l=>l.id===selectedId);if(!l)throw Error('Select a label first.');applyLocal(l,$('newname').value)}catch(e){status(e.message,true)}};
$('upload').onchange=e=>upload(e.target.files[0]);$('drop').ondragover=e=>e.preventDefault();$('drop').ondrop=e=>{e.preventDefault();upload(e.dataTransfer.files[0])};$('sample').onclick=sample;$('generate').onclick=generate;$('source').onclick=()=>{original=true;render()};$('result').onclick=()=>{original=false;render()};$('page').onchange=async()=>{if(busy)return;setBusy(true);try{await pdfPage(+$('page').value);if($('mode').value==='local')await localGenerate()}catch(e){status(e.message,true)}finally{setBusy(false)}};
$('settings').onclick=()=>{$('endpoint').value=base;$('dialog').showModal()};$('save').onclick=()=>{try{const v=$('endpoint').value.trim();if(v&&new URL(v).protocol!=='https:')throw Error('Use an HTTPS API endpoint.');base=v;localStorage.setItem('floorplan-api',base);$('dialog').close();status('Connection saved. Built-in processing remains available; choose API mode when you are ready.')}catch(e){$('connectionstatus').textContent=e.message}};
$('revform').onsubmit=async e=>{e.preventDefault();if(busy)return;const instruction=$('instruction').value;if(instruction.trim())$('instruction').value='';try{await revise(instruction)}catch(e){status(e.message,true)}};document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{$('instruction').value=b.dataset.prompt;$('instruction').focus()});$('undo').onclick=()=>{if(busy||!history.length)return;future.push(snapshot());restoreRevision(history.pop());status('Previous revision restored.');$('history').textContent='';};
$('redo').onclick=()=>{if(busy||!future.length)return;history.push(snapshot());restoreRevision(future.pop());status('Next revision restored.');};
$('clearinstruction').onclick=()=>{if(busy)return;$('instruction').value='';pendingQuestion=null;$('instruction').focus();status('Instruction cleared. Your drawing and selection are unchanged.');};

$('export').onclick=()=>{if(busy)return;try{original=false;render();const exportCanvas=makeCanvas(canvas.width,canvas.height),eg=exportCanvas.getContext('2d');eg.filter=colour?'none':'grayscale(1)';eg.drawImage(canvas,0,0);exportCanvas.toBlob(b=>{if(!b)return status('Export failed.',true);const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='floorplan-revision-'+history.length+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);status('PNG exported.');},'image/png')}catch(e){status('Export blocked by the API image server. Enable CORS for its previews.',true)}};
if(document.modelContext?.registerTool)Promise.resolve(document.modelContext.registerTool({name:'edit_floorplan',description:'Apply text and selected-region design edits to the current floorplan; runs built-in processing first when needed.',inputSchema:{type:'object',properties:{instruction:{type:'string'}},required:['instruction'],additionalProperties:false},annotations:{readOnlyHint:false},execute:({instruction})=>revise(instruction)})).catch(()=>{});
$('startupload').onchange=e=>upload(e.target.files[0]);$('startdrop').ondragover=e=>e.preventDefault();$('startdrop').ondrop=e=>{e.preventDefault();upload(e.dataTransfer.files[0])};

$('newupload').onchange=e=>upload(e.target.files[0]);

fetch('/api/status').then(r=>r.json()).then(data=>{$('aistatus').textContent=data.aiReady?'AI assistance connected · text stays protected':'Built-in edits available · AI assistance not connected';}).catch(()=>{$('aistatus').textContent='Built-in edits available · AI assistance unavailable';});

let comparisonSource=null,comparisonWidth=0,comparisonHeight=0;
function renderComparison(){
 const c=$('comparison');if(!c?.getContext||!sourceImage||!img)return;
 const w=canvas.width,h=canvas.height;
 if(comparisonSource===sourceImage&&comparisonWidth===w&&comparisonHeight===h)return;
 c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,w,h);
 const sw=sourceImage.naturalWidth||sourceImage.width,sh=sourceImage.naturalHeight||sourceImage.height,scan=makeCanvas(sw,sh),sg=scan.getContext('2d');sg.drawImage(sourceImage,0,0);
 const crop=sourceCrop(sg.getImageData(0,0,sw,sh).data,sw,sh),f=pageFit(crop.w,crop.h,portrait);
 g.drawImage(sourceImage,crop.x,crop.y,crop.w,crop.h,f.x*w/f.w,f.y*h/f.h,crop.w*f.scale*w/f.w,crop.h*f.scale*h/f.h);
 comparisonSource=sourceImage;comparisonWidth=w;comparisonHeight=h;
}
function setComparison(value){const v=Math.max(0,Math.min(100,value)),d=$('divider');d.parentElement?.style.setProperty('--split',v+'%');d.setAttribute?.('aria-valuenow',String(Math.round(v)));d.setAttribute?.('aria-valuetext',Math.round(v)+'% original, '+Math.round(100-v)+'% edited');}
let comparing=false;
$('divider').onpointerdown=e=>{comparing=true;e.preventDefault();$('divider').setPointerCapture(e.pointerId);moveComparison(e)};
function moveComparison(e){if(!comparing)return;const r=canvas.getBoundingClientRect();setComparison((e.clientX-r.left)/r.width*100)}
$('divider').onpointermove=moveComparison;
$('divider').onpointerup=e=>{moveComparison(e);comparing=false};$('divider').onpointercancel=()=>{comparing=false};
$('divider').onkeydown=e=>{const v=Number($('divider').getAttribute('aria-valuenow'));const next={ArrowLeft:v-1,ArrowRight:v+1,Home:0,End:100}[e.key];if(next!==undefined){e.preventDefault();setComparison(next)}};

async function readSourceDisclaimer(ocr){
 // Small pale footer text can disappear in the drawing-stroke OCR mask.
 // Read the lower page directly at higher resolution, retaining complete lines.
 const top=Math.floor(img.height*.68),bottom=Math.floor(footerTop(img.height)),scale=2;
 const scan=makeCanvas(img.width*scale,(bottom-top)*scale),g=scan.getContext('2d');
 g.drawImage(img,0,top,img.width,bottom-top,0,0,scan.width,scan.height);
 const pixels=g.getImageData(0,0,scan.width,scan.height);for(let i=0;i<pixels.data.length;i+=4){const v=pixels.data[i]<235?0:255;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=v;}g.putImageData(pixels,0,0);
 const result=await ocr.recognize(scan,{}, {text:true,tsv:true,blocks:false,hocr:false});
 const lines=new Map();for(const row of String(result.data.tsv||'').split('\n').slice(1)){
  const c=row.split('\t');if(c[0]!=='5'||!c[11]?.trim()||+c[10]<10)continue;
  const key=c.slice(1,5).join(':');if(!lines.has(key))lines.set(key,[]);
  lines.get(key).push({text:c.slice(11).join(' '),x:+c[6]/scale,y:top+(+c[7])/scale,w:+c[8]/scale,h:+c[9]/scale});
 }
 for(const words of lines.values()){
  const x=Math.min(...words.map(w=>w.x)),y=Math.min(...words.map(w=>w.y)),right=Math.max(...words.map(w=>w.x+w.w)),bottom=Math.max(...words.map(w=>w.y+w.h));
  const l={id:'disclaimer-'+labels.length,text:words.map(w=>w.text).join(' '),x,y,w:right-x,h:bottom-y};
  if(isSourceDisclaimer(l,img.height)&&l.h<img.height*.025&&l.w>img.width*.15)labels.push(l);
 }
}

function surroundingBackground(source,r){
 const margin=Math.max(3,Math.round(source.width/400)),x=Math.max(0,r.x-margin),y=Math.max(0,r.y-margin),right=Math.min(source.width,r.x+r.w+margin),bottom=Math.min(source.height,r.y+r.h+margin);
 const pixels=source.getContext('2d').getImageData(x,y,right-x,bottom-y).data,bins=new Map();
 for(let py=y;py<bottom;py++)for(let px=x;px<right;px++){
  if(px>=r.x&&px<r.x+r.w&&py>=r.y&&py<r.y+r.h)continue;
  if(labels.some(l=>px>=l.x-2&&px<=l.x+l.w+2&&py>=l.y-2&&py<=l.y+l.h+2))continue;
  const i=((py-y)*(right-x)+px-x)*4,red=pixels[i],green=pixels[i+1],blue=pixels[i+2];
  if(Math.max(red,green,blue)<70)continue;
  const key=[red>>3,green>>3,blue>>3].join(',');const b=bins.get(key)||{count:0,r:0,g:0,b:0};b.count++;b.r+=red;b.g+=green;b.b+=blue;bins.set(key,b);
 }
 const best=[...bins.values()].sort((a,b)=>b.count-a.count)[0];
 return best?`rgb(${Math.round(best.r/best.count)},${Math.round(best.g/best.count)},${Math.round(best.b/best.count)})`:sampleBackground(r);
}

async function scanRemovalText(rect){
 // Re-read original pixels locally: the drawing mask can discard characters
 // touching furniture, and page-level OCR can miss small measurements.
 const source=flattened(),pad=12,x=Math.max(0,Math.floor(rect.x)-pad),y=Math.max(0,Math.floor(rect.y)-pad),w=Math.min(source.width-x,Math.ceil(rect.w)+pad*2),h=Math.min(source.height-y,Math.ceil(rect.h)+pad*2);
 const scale=Math.min(4,3000/Math.max(w,h)),scan=makeCanvas(Math.ceil(w*scale),Math.ceil(h*scale));scan.getContext('2d').drawImage(source,x,y,w,h,0,0,scan.width,scan.height);
 try{
  const ocr=await getWorker(),result=await ocr.recognize(scan,{}, {text:true,tsv:true,blocks:false,hocr:false});
  const rows=String(result.data.tsv||'').split('\n').slice(1),lines=new Map();
  for(const row of rows){const c=row.split('\t');if(c[0]!=='5'||+c[10]<15||!c[11]?.trim())continue;const key=c.slice(1,5).join(':');if(!lines.has(key))lines.set(key,[]);lines.get(key).push({text:c.slice(11).join(' '),x:x+(+c[6])/scale,y:y+(+c[7])/scale,w:+c[8]/scale,h:+c[9]/scale});}
  for(const words of lines.values()){const left=Math.min(...words.map(l=>l.x)),top=Math.min(...words.map(l=>l.y)),right=Math.max(...words.map(l=>l.x+l.w)),bottom=Math.max(...words.map(l=>l.y+l.h));const room=/bedroom|living|dining|kitchen|garage|terrace|courtyard|bath|study|lounge/i.test(words.map(w=>w.text).join(' '));textRegions.push({x:left-5,y:top-3,w:right-left+10,h:bottom-top+6+(room?(bottom-top)*2:0)});}
 }catch{throw Error('Could not verify the text in this area. Nothing was changed. Please try again.');}
}

async function readVerificationText(image){
 const scale=2,scan=makeCanvas(image.width*scale,image.height*scale);scan.getContext('2d').drawImage(image,0,0,scan.width,scan.height);
 const ocr=await getWorker(),result=await ocr.recognize(scan,{}, {text:true,tsv:true,blocks:false,hocr:false});
 const rows=String(result.data.tsv||'').split('\n').slice(1).map(r=>r.split('\t')).filter(c=>c[0]==='5'&&+c[10]>=25&&/[a-z0-9]/i.test(c[11]||''));
 const lines=new Map();for(const c of rows){const key=c.slice(1,5).join(':');if(!lines.has(key))lines.set(key,[]);lines.get(key).push(c);}
 // OCR frequently calls vehicle and furniture strokes '1' or 'I'. A text
 // field has words or a dimensional number; keep every word in that field,
 // including the standalone room number in 'BEDROOM 2'.
 return [...lines.values()].filter(line=>/[a-z]{2}|\d{2,}|\d[.,]\d|\d\s*[x×]\s*\d/i.test(line.map(c=>c.slice(11).join(' ')).join(' '))).flat().map(c=>({text:normalize(c.slice(11).join(' ')),x:Math.floor(+c[6]/scale),y:Math.floor(+c[7]/scale),w:Math.ceil(+c[8]/scale),h:Math.ceil(+c[9]/scale)}));
}
function sameVerifiedText(before,after){
 const remaining=after.slice();for(const word of before){const i=remaining.findIndex(w=>w.text===word.text&&Math.abs(w.x-word.x)<8&&Math.abs(w.y-word.y)<8);if(i<0)return false;remaining.splice(i,1);}return remaining.length===0;
}
async function reviseWithImageAI(instruction,selection){
 if(!selection)selection=await locateImageEdit(instruction);
 const r={x:Math.floor(selection.x),y:Math.floor(selection.y),w:Math.ceil(selection.w),h:Math.ceil(selection.h)};assertOutsideFooter(r,img.height);
 if(r.w<20||r.h<20)throw Error('Select a larger area for AI editing.');
 const saved=snapshot();setBusy(true);try{
  status('Step 1 of 3: recording the original text…');const source=flattened(),before=await readVerificationText(source);if(!before.length)throw Error('Text could not be verified on this plan. Nothing was changed.');
  // Include nearby floor and boundaries as context. Only the selected pixels
  // are composited back, regardless of how the model treats the mask.
  const pad=Math.max(80,Math.round(Math.max(r.w,r.h)*.35));
  const context={x:Math.max(0,r.x-pad),y:Math.max(0,r.y-pad)};
  context.w=Math.min(source.width-context.x,r.x+r.w+pad-context.x);context.h=Math.min(source.height-context.y,r.y+r.h+pad-context.y);
  const side=Math.max(context.w,context.h),crop=makeCanvas(side,side),g=crop.getContext('2d'),ox=Math.floor((side-context.w)/2),oy=Math.floor((side-context.h)/2);
  g.fillStyle='white';g.fillRect(0,0,side,side);g.drawImage(source,context.x,context.y,context.w,context.h,ox,oy,context.w,context.h);
  const mx=ox+r.x-context.x,my=oy+r.y-context.y;
  let candidate;
  for(let attempt=0;attempt<2;attempt++){
  status(attempt?'Checking the first result found a problem. Trying your change again automatically…':'Step 2 of 3: AI is editing the requested area…');
  const editInstruction=instruction+(attempt?'\nThe previous attempt failed quality checks. Make only the requested graphic change. Do not introduce text or dark filled areas. Preserve all original labels and measurements.':'');
  const response=await fetch('/api/image-edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instruction:editInstruction,image:crop.toDataURL('image/png')}),signal:AbortSignal.timeout(210000)});const data=await response.json();if(!response.ok)throw Error(data.message||'AI image edit failed. Nothing was changed.');
  const edited=await imageFrom(data.image);candidate=makeCanvas(source.width,source.height);const cg=candidate.getContext('2d');cg.drawImage(source,0,0);const scale=edited.naturalWidth/side;cg.drawImage(edited,mx*scale,my*scale,r.w*scale,r.h*scale,r.x,r.y,r.w,r.h);
  if(/^(?:please\s+)?(?:remove|erase|delete)\b/i.test(instruction)&&darkFillIntroduced(source,candidate,r)){if(attempt===0)continue;throw Error('I couldn’t make this change cleanly after two attempts. Your plan is unchanged.');}
  // Restore the original text pixels
  // before OCR validation so a graphic edit cannot redraw labels or numbers.
  protectTextPixels(cg,source,before.map(word=>{const pad=Math.max(6,Math.ceil(word.h));return {...word,x:Math.max(0,word.x-pad),y:Math.max(0,word.y-pad),w:word.w+pad*2,h:word.h+pad*2}}),r);
  status('Step 3 of 3: checking text across the entire plan…');const after=await readVerificationText(candidate);
  const problems=[];if(!verifyOriginalTextPixels(source,candidate,before,after,problems)){if(attempt===0)continue;throw Error('I couldn’t preserve the text cleanly after two attempts. Your plan is unchanged.');}
  break;
  }
  history.push(saved);future=[];img=candidate;labels=labels.map(l=>({...l,changed:false}));manual=null;selectedId=null;original=false;render();listLabels();status('AI edit applied. OCR comparison passed; outside your selection is unchanged. Review the drawing before exporting.');
 }catch(e){restoreRevision(saved);throw e}finally{setBusy(false)}
}

function darkFillIntroduced(source,candidate,r){
 const a=source.getContext('2d').getImageData(r.x,r.y,r.w,r.h).data,b=candidate.getContext('2d').getImageData(r.x,r.y,r.w,r.h).data;let oldDark=0,newDark=0;
 for(let i=0;i<a.length;i+=4){if((a[i]+a[i+1]+a[i+2])/3<60)oldDark++;if((b[i]+b[i+1]+b[i+2])/3<60)newDark++;}
 return (newDark-oldDark)/(a.length/4)>.25;
}

function verifyOriginalTextPixels(source,candidate,before,after,problems=[]){
 const a=source.getContext('2d'),b=candidate.getContext('2d');
 const preserved=before.every(word=>{
  const x=Math.max(0,word.x-2),y=Math.max(0,word.y-2),w=Math.min(source.width-x,word.w+4),h=Math.min(source.height-y,word.h+4);
  const original=a.getImageData(x,y,w,h).data,edited=b.getImageData(x,y,w,h).data;
  if(original.every((value,i)=>value===edited[i]))return true;
  const matched=after.some(other=>other.text===word.text&&Math.abs(other.x-word.x)<8&&Math.abs(other.y-word.y)<8&&Math.abs(other.h-word.h)<5);if(!matched)problems.push('could not confirm “'+word.text+'”');return matched;
 });
 if(!preserved)return false;
 // Reject invented words in altered pixels, but tolerate OCR drift on pixels
 // that were not edited. Fixture insertion uses its separate symbol path.
 return after.every(word=>{
  if(before.some(other=>other.text===word.text&&Math.abs(other.x-word.x)<8&&Math.abs(other.y-word.y)<8))return true;
  const x=Math.max(0,word.x-2),y=Math.max(0,word.y-2),w=Math.min(source.width-x,word.w+4),h=Math.min(source.height-y,word.h+4);
  const original=a.getImageData(x,y,w,h).data,edited=b.getImageData(x,y,w,h).data;
  const unchanged=original.every((value,i)=>value===edited[i]);if(!unchanged)problems.push('unexpected text “'+word.text+'”');return unchanged;
 });
}

async function locateImageEdit(instruction,selection=null){
 setBusy(true);status('Finding the requested area on the plan…');try{
 const current=flattened(),preview=makeCanvas(1800,Math.round(current.height*1800/current.width));preview.getContext('2d').drawImage(current,0,0,preview.width,preview.height);
 const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instruction,imageEdit:!parseFixture(instruction),width:current.width,height:current.height,selection,labels:labels.map(({id,text,x,y,w,h})=>({id,text,x,y,w,h})),image:preview.toDataURL('image/png')}),signal:AbortSignal.timeout(100000)});
 const data=await response.json();if(!response.ok)throw Error(data.message||'Could not locate the requested area.');const plan=validatePlan(data,current.width,current.height,selection);
 if(!plan.operations.length){pendingQuestion={instruction,question:plan.message||'Which room or object do you mean?'};throw Error(pendingQuestion.question+' Reply below and I’ll continue with your original request.');}
 if(plan.operations.some(op=>!['fixture','remove'].includes(op.type))||plan.operations.length>1&&plan.operations.some(op=>op.type!=='remove'))throw Error(plan.message||'Select one area to show where this image edit should go.');
 const regions=plan.operations.map(op=>op.rect),x=Math.min(...regions.map(r=>r.x)),y=Math.min(...regions.map(r=>r.y));
 const rect={x,y,w:Math.max(...regions.map(r=>r.x+r.w))-x,h:Math.max(...regions.map(r=>r.y+r.h))-y};showSelection(rect);return rect;
 }finally{setBusy(false)}
}

function updateFormatButtons(){
 canvas.style.filter=colour?'none':'grayscale(1)';
 for(const [id,on] of [['landscape',!portrait],['portrait',portrait],['greyscale',!colour],['colour',colour]]){$(id)?.setAttribute?.('aria-pressed',String(on));$(id)?.classList.toggle('active',on);}
}
function changeOrientation(){
 if(busy||!ready)return;
 const current=flattened(),sw=sourceImage.naturalWidth||sourceImage.width,sh=sourceImage.naturalHeight||sourceImage.height,scan=makeCanvas(sw,sh);scan.getContext('2d').drawImage(sourceImage,0,0);
 const crop=sourceCrop(scan.getContext('2d').getImageData(0,0,sw,sh).data,sw,sh),from=pageFit(crop.w,crop.h,portrait),to=pageFit(crop.w,crop.h,!portrait),scale=to.scale/from.scale,dx=to.x-from.x*scale,dy=to.y-from.y*scale;
 const next=makeCanvas(to.w,to.h),g=next.getContext('2d');g.fillStyle='white';g.fillRect(0,0,to.w,to.h);g.save();g.beginPath();g.rect(0,0,to.w,footerTop(to.h));g.clip();g.drawImage(current,0,0,current.width,footerTop(current.height),dx,dy,current.width*scale,footerTop(current.height)*scale);g.restore();drawFooter(g,to.w,to.h);
 const convert=l=>({...l,x:l.x*scale+dx,y:l.y*scale+dy,w:l.w*scale,h:l.h*scale,...(l.fontSize?{fontSize:l.fontSize*scale}:{}),...(l.eraseRect?{eraseRect:convert(l.eraseRect)}:{})});
 recordSnapshot();portrait=!portrait;img=next;labels=labels.map(l=>({...convert(l),changed:false}));textRegions=textRegions.map(convert);manual=null;selectedId=null;original=false;updateFormatButtons();render();listLabels();status((portrait?'Portrait':'Landscape')+' A4 page. Your edits were retained.');
}
$('portrait').onclick=()=>{if(!portrait)changeOrientation();};
$('landscape').onclick=()=>{if(portrait)changeOrientation();};
function changeColour(value){if(busy||!ready||colour===value)return;const current=flattened();let added=false;recordSnapshot();if(value){const result=colourisePlan(current,labels);if(result.changed){img=result.canvas;labels=labels.map(l=>({...l,changed:false}));added=true;}}colour=value;setComparison(0);updateFormatButtons();render();status(value?(added?'Added soft colours to the black-and-white plan. Text and drawing lines were preserved.':'Original colours shown. Your edits were retained.'):'Greyscale shown. Your edits were retained.');}
function colourisePlan(source,knownLabels){
 const out=makeCanvas(source.width,source.height),g=out.getContext('2d');g.drawImage(source,0,0);const pixels=g.getImageData(0,0,out.width,out.height),d=pixels.data,w=out.width,h=out.height,n=w*h;
 let colourful=0;for(let i=0;i<d.length;i+=4)if(Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])>15)colourful++;
 if(colourful>n*.001)return {canvas:source,changed:false};
 const seen=new Int32Array(n),queue=new Int32Array(n);let changed=false,regionId=0;
 for(let start=0;start<n;start++){
  if(seen[start]||d[start*4]<110)continue;const shade=d[start*4];regionId++;let head=0,tail=1,minX=w,minY=h,maxX=0,maxY=0;queue[0]=start;seen[start]=regionId;
  while(head<tail){const k=queue[head++],x=k%w,y=Math.floor(k/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const next of [x>0?k-1:-1,x<w-1?k+1:-1,y>0?k-w:-1,y<h-1?k+w:-1])if(next>=0&&!seen[next]&&Math.abs(d[next*4]-shade)<=5){seen[next]=regionId;queue[tail++]=next;}
  }
  if(maxX-minX<5||maxY-minY<5||tail<Math.max(200,n*.0003)||minY>=h*.94||minX===0||minY===0||maxX===w-1||maxY===h-1||tail>n*.3)continue;
  const nearby=knownLabels.filter(l=>[[l.x-3,l.y-3],[l.x+l.w+3,l.y-3],[l.x-3,l.y+l.h+3],[l.x+l.w+3,l.y+l.h+3]].filter(([x,y])=>x>=0&&x<w&&y>=0&&y<h&&seen[Math.floor(y)*w+Math.floor(x)]===regionId).length>=2).map(l=>l.text).join(' ').toLowerCase();
  const palette=/bath|ensuite|laundry/.test(nearby)?[216,234,241]:/deck|verandah|porch|covered/.test(nearby)?[235,220,185]:/garage|residence/.test(nearby)?[232,214,194]:/bed|living|dining|kitchen/.test(nearby)?[248,238,217]:shade<245?[216,231,200]:[238,237,225];
  for(let j=0;j<tail;j++){const i=queue[j]*4;const variation=Math.min(1,Math.max(.85,1+(d[i]-shade)/255));d[i]=Math.round(palette[0]*variation);d[i+1]=Math.round(palette[1]*variation);d[i+2]=Math.round(palette[2]*variation);}changed=true;
 }
 if(changed)g.putImageData(pixels,0,0);return {canvas:out,changed};
}
$('colour').onclick=()=>changeColour(true);
$('greyscale').onclick=()=>changeColour(false);
updateFormatButtons();

async function reviseBedroomFans(instruction,selection){
 const saved=snapshot(),oldHistory=history.slice(),oldFuture=future.slice();setBusy(true);status('Locating each bedroom fan separately…');
 try{
 const current=flattened(),preview=makeCanvas(1800,Math.round(current.height*1800/current.width));preview.getContext('2d').drawImage(current,0,0,preview.width,preview.height);
 const response=await fetch('/api/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instruction:'Locate every ceiling fan icon in the bedrooms. Return one tightly bounded remove rectangle per fan, with a small margin around all three blades. Exclude all labels, measurements, doors and walls. Do not return a large combined rectangle. Do not include beds, cars or other symbols. Only locate the fans; the client will handle requested text movement separately. '+(selection?'Only inside the supplied selection.':''),width:current.width,height:current.height,selection,labels:labels.map(({id,text,x,y,w,h})=>({id,text,x,y,w,h})),image:preview.toDataURL('image/png')}),signal:AbortSignal.timeout(100000)});
 const data=await response.json();if(!response.ok)throw Error(data.message||'Could not locate the fans.');const plan=validatePlan(data,current.width,current.height,selection);
 if(!plan.operations.length)throw Error(plan.message||'No bedroom fans were located.');
 const regions=plan.operations.map(op=>{if(op.type!=='remove')throw Error('The fan locations could not be validated.');return {x:Math.floor(op.rect.x),y:Math.floor(op.rect.y),w:Math.ceil(op.rect.w),h:Math.ceil(op.rect.h)};});
 const next=makeCanvas(current.width,current.height),g=next.getContext('2d');g.drawImage(current,0,0);
 for(const r of regions){if(labels.some(l=>overlaps(l,r)&&(/[a-z]{3}/i.test(l.text)||/\d.*[x×].*\d/.test(l.text))))throw Error('A fan location overlaps text. Your plan was kept unchanged.');g.fillStyle=surroundingBackground(current,r);g.fillRect(r.x,r.y,r.w,r.h);}
 const updated=labels.filter(l=>!regions.some(r=>overlaps(l,r))).map(l=>({...l,changed:false}));
 if(/\b(?:move|shift|centr[ei]|center)\b/i.test(instruction)){
  const used=new Set();
  for(const r of regions){const cx=r.x+r.w/2,cy=r.y+r.h/2;
   const candidates=updated.filter(l=>/^(?:(?:main|master)\s+)?bed(?:room)?\s*\d*$/i.test(l.text.trim())&&!used.has(l.id)&&Math.abs(l.x+l.w/2-cx)<Math.max(r.w*2,l.w)&&l.y<cy).sort((a,b)=>Math.abs(a.y-cy)-Math.abs(b.y-cy));
   const name=candidates[0];if(!name)throw Error('Could not match a fan to its bedroom label. Nothing was changed.');used.add(name.id);
   const dims=updated.filter(l=>/\d.*[x×].*\d/.test(l.text)&&l.y>name.y&&l.y<r.y&&Math.abs(l.x+l.w/2-(name.x+name.w/2))<name.w*.7).sort((a,b)=>a.y-b.y)[0];
   const group=dims?[name,dims]:[name],left=Math.min(...group.map(l=>l.x)),top=Math.min(...group.map(l=>l.y)),right=Math.max(...group.map(l=>l.x+l.w)),bottom=Math.max(...group.map(l=>l.y+l.h));
   const dy=Math.round(cy-(top+bottom)/2);if(dy<0)throw Error('There is no clear space below this label.');
   for(const l of group){const a={x:Math.floor(l.x-2),y:Math.floor(l.y-2),w:Math.ceil(l.w+4),h:Math.ceil(l.h+4)},dest={...a,y:a.y+dy};assertOutsideFooter(dest,current.height);
    if(updated.some(o=>!group.includes(o)&&overlaps(o,dest)))throw Error('Moving the labels would cover other text.');
    const px=g.getImageData(dest.x,dest.y,dest.w,dest.h).data;let ink=0;for(let i=0;i<px.length;i+=4)if(px[i]<90)ink++;if(ink>4)throw Error('Moving the labels would cover drawing lines.');
   }
   for(const l of group){const a={x:Math.floor(l.x-2),y:Math.floor(l.y-2),w:Math.ceil(l.w+4),h:Math.ceil(l.h+4)};g.fillStyle=surroundingBackground(current,a);g.fillRect(a.x,a.y,a.w,a.h);}
   for(const l of group){const a={x:Math.floor(l.x-2),y:Math.floor(l.y-2),w:Math.ceil(l.w+4),h:Math.ceil(l.h+4)};g.drawImage(current,a.x,a.y,a.w,a.h,a.x,a.y+dy,a.w,a.h);l.y+=dy;delete l.eraseRect;}
  }
 }
 img=next;labels=updated;textRegions=updated.map(l=>({...l}));history=[...oldHistory,saved];future=[];manual=null;selectedId=null;original=false;render();listLabels();status('Removed '+regions.length+' bedroom fans'+(/\b(?:move|shift|centr[ei]|center)\b/i.test(instruction)?' and moved their labels and measurements down into the cleared space':'')+'. Undo restores the whole change.');
 }catch(e){history=oldHistory;future=oldFuture;restoreRevision(saved);throw e}finally{setBusy(false)}
}
