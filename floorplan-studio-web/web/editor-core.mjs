export const normalize=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function parseRevision(input,selected=false){
 let s=String(input).trim().replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[.!]$/,'');
 let m=s.match(/^(?:please\s+)?(?:rename|replace|change|make)\s+['"](.+?)['"]\s+(?:(?:to(?:\s+be)?|as)\s+)?['"](.+?)['"](?:\s+instead)?$/i);
 if(!m)m=s.match(/^(?:please\s+)?(?:rename|replace|change|make)\s+(.+?)\s+(?:to(?:\s+be)?|into|with|as)\s+(.+?)(?:\s+instead)?$/i);
 if(!m)m=s.match(/^(.+?)\s*(?:→|->)\s*(.+)$/);
 if(!m&&selected)m=s.match(/^(?:rename|replace|change|make)\s+(this|selected(?: label| room)?)\s+(?:to\s+)?(.+)$/i);
 if(!m)throw Error("Use a rename instruction, for example: Rename study nook to media room. You can also click a label or draw a box around it.");
 const from=m[1].replace(/^['"]|['"]$/g,'').trim(),to=m[2].replace(/^['"]|['"]$/g,'').trim();
 if(!from||!to||to.length>60)throw Error('Enter a room name between 1 and 60 characters.');return {from,to};
}
export function findLabel(labels,from,selectedId){
 const selected=labels.find(l=>l.id===selectedId);
 if(selected&&(normalize(from)===normalize(selected.text)||/^(this|selected(?: label| room)?)$/i.test(from)||selected.manual))return selected;
 const matches=labels.filter(l=>normalize(l.text)===normalize(from));
 if(matches.length>1)throw Error('Several labels match. Click the specific label on the drawing, then apply the revision again.');
 if(!matches.length)throw Error('That label was not recognised. Click a detected label below, or drag a tight box around the text on the preview and try again.');return matches[0];
}
export function labelsFromTSV(tsv,width,height){
 const rows=String(tsv||'').trim().split('\n').slice(1),groups=new Map();
 for(const row of rows){const c=row.split('\t');if(c.length<12||c[0]!=='5')continue;const text=c.slice(11).join(' ').trim(),conf=Number(c[10]),x=+c[6],y=+c[7],w=+c[8],h=+c[9];if(!text||conf<25||w<2||h<3||x<0||y<0||x+w>width||y+h>height)continue;const key=c.slice(1,5).join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push({text,conf,x,y,w,h});}
 const result=[];
 for(const words of groups.values()){
  words.sort((a,b)=>a.x-b.x);let parts=[];
  for(const word of words){const prev=parts[parts.length-1];if(prev&&word.x-(prev.x+prev.w)>Math.max(word.h,prev.h)*3){add(parts);parts=[]}parts.push(word)}add(parts);
 }
 function add(words){if(!words.length)return;const text=words.map(w=>w.text).join(' ');if(!/[a-z0-9]/i.test(text))return;const x=Math.max(0,Math.min(...words.map(w=>w.x))-2),y=Math.max(0,Math.min(...words.map(w=>w.y))-2),right=Math.min(width,Math.max(...words.map(w=>w.x+w.w))+2),bottom=Math.min(height,Math.max(...words.map(w=>w.y+w.h))+2);result.push({id:'ocr-'+result.length,text,x,y,w:right-x,h:bottom-y,fontSize:Math.max(...words.map(w=>w.h))*1.2,confidence:Math.round(words.reduce((n,w)=>n+w.conf,0)/words.length)});}
 return result;
}
export function fitA4(width,height){const w=Math.min(2600,Math.max(2080,width)),h=Math.round(w*210/297),scale=Math.min((w-32)/width,(h-32)/height);return {w,h,scale,x:(w-width*scale)/2,y:(h-height*scale)/2};}
// Build an OCR-only mask: remove large connected drawing strokes, retain small text strokes.
// This mask is never used as the displayed or exported drawing.
export function textMask(rgba,width,height){
 const n=width*height,ink=new Uint8Array(n),seen=new Uint8Array(n),queue=new Int32Array(n),out=new Uint8ClampedArray(n*4);out.fill(255);
 for(let i=0;i<n;i++)ink[i]=rgba[i*4]<175?1:0;
 const maxH=Math.max(45,height*.035),maxW=Math.max(90,width*.055);
 for(let i=0;i<n;i++){if(!ink[i]||seen[i])continue;let head=0,tail=1,minX=i%width,maxX=minX,minY=Math.floor(i/width),maxY=minY;queue[0]=i;seen[i]=1;
 while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const q=ny*width+nx;if(ink[q]&&!seen[q]){seen[q]=1;queue[tail++]=q}}}
 if(maxX-minX>maxW||maxY-minY>maxH||tail<3)continue;
 for(let k=0;k<tail;k++){const j=queue[k]*4;out[j]=out[j+1]=out[j+2]=0;}
 }return out;
}
export function tightenLabel(label,rgba,width,height){
 const left=Math.max(0,Math.floor(label.x)),top=Math.max(0,Math.floor(label.y)),right=Math.min(width,Math.ceil(label.x+label.w)),bottom=Math.min(height,Math.ceil(label.y+label.h));
 const runs=[];let run=null;
 for(let y=top;y<bottom;y++){let count=0;for(let x=left;x<right;x++)if(rgba[(y*width+x)*4]<145)count++;
 if(count>=3){if(!run)run={start:y,end:y,count:0};run.end=y;run.count+=count}else if(run){runs.push(run);run=null}}
 if(run)runs.push(run);const best=runs.sort((a,b)=>b.count-a.count)[0];if(best&&best.end-best.start>=4){label.y=Math.max(0,best.start-1);label.h=Math.min(height-label.y,best.end-best.start+3);label.fontSize=(best.end-best.start+1)/.73;}return label;
}
