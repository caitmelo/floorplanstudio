import {boxesOverlap,within} from './hybrid-contract.mjs';
export function chooseFixtureRect(area,kind,labels,width,height,instruction='',rgba=null){
 const ratio=kind==='car'?.48:kind==='bbq'?1.8:kind==='bath'?.5:kind==='shower'?1:kind==='sink'?1.3:.65;
 const targetHeight=kind==='car'?height*.075:kind==='bbq'?height*.025:kind==='bath'?height*.055:height*.033;
 const h=Math.min(area.h*.65,targetHeight),w=Math.min(area.w*.7,h*ratio),actualH=Math.min(h,w/ratio),margin=Math.max(3,width/600);
 if(w<12||actualH<12)throw Error('The selected box is too small for this fixture. Draw a slightly larger box.');
 const left=area.x+margin,right=area.x+area.w-w-margin,top=area.y+margin,bottom=area.y+area.h-actualH-margin;
 const xChoices=/left/i.test(instruction)?[left]:/right/i.test(instruction)?[right]:[(left+right)/2,left,right];
 const yChoices=/top|upper/i.test(instruction)?[top]:/bottom|lower/i.test(instruction)?[bottom]:[(top+bottom)/2,top,bottom];
 const candidates=[];for(const x of xChoices)for(const y of yChoices)candidates.push({x:Math.round(x),y:Math.round(y),w:Math.round(w),h:Math.round(actualH)});
 for(const r of candidates){if(!within(r,area)||labels.some(l=>boxesOverlap(r,{x:l.x-3,y:l.y-3,w:l.w+6,h:l.h+6})))continue;
 if(rgba){let dark=0,total=0;for(let y=r.y;y<r.y+r.h;y+=2)for(let x=r.x;x<r.x+r.w;x+=2){total++;if(rgba[(y*width+x)*4]<110)dark++}if(dark/total>.012)continue;}return r;}
 throw Error('There is no clear space in that selection without covering text or drawing lines. Select an empty spot for the fixture.');
}
export function drawFixture(g,r,kind){
 g.save();g.beginPath();g.rect(r.x,r.y,r.w,r.h);g.clip();g.translate(r.x,r.y);g.scale(r.w/100,r.h/100);g.strokeStyle='#222';g.fillStyle='#fff';g.lineWidth=1.7;g.lineJoin='round';
 const rect=(x,y,w,h)=>{g.fillRect(x,y,w,h);g.strokeRect(x,y,w,h)};
 const ellipse=(x,y,rx,ry)=>{g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();g.stroke()};
 if(kind==='bbq'){rect(2,10,96,80);rect(8,20,58,53);for(let x=14;x<64;x+=7){g.beginPath();g.moveTo(x,24);g.lineTo(x,69);g.stroke()}rect(71,20,21,53);[18,34,50].forEach(x=>ellipse(x,81,2.5,3));}
 if(kind==='car'){g.beginPath();g.roundRect(12,3,76,94,13);g.fill();g.stroke();g.beginPath();g.roundRect(21,29,58,40,8);g.stroke();g.beginPath();g.moveTo(23,25);g.lineTo(30,13);g.lineTo(70,13);g.lineTo(77,25);g.closePath();g.stroke();g.beginPath();g.moveTo(23,73);g.lineTo(29,85);g.lineTo(71,85);g.lineTo(77,73);g.closePath();g.stroke();rect(5,31,7,8);rect(88,31,7,8);}
 if(kind==='toilet'){rect(17,3,66,25);ellipse(50,60,31,35);ellipse(50,58,20,24);}
 if(kind==='sink'){rect(3,5,94,90);ellipse(50,55,35,30);ellipse(50,55,3,3);rect(46,10,8,21);}
 if(kind==='bath'){g.beginPath();g.roundRect(5,3,90,94,15);g.fill();g.stroke();g.beginPath();g.roundRect(14,11,72,78,20);g.stroke();ellipse(50,22,3,2);}
 if(kind==='shower'){rect(3,3,94,94);g.beginPath();g.moveTo(6,6);g.lineTo(94,94);g.moveTo(94,6);g.lineTo(6,94);g.stroke();ellipse(50,50,7,7);}
 g.restore();
}
export function protectTextPixels(g,source,regions,affected){for(const l of regions){if(!boxesOverlap(l,affected))continue;const x=Math.max(0,Math.floor(l.x)-2),y=Math.max(0,Math.floor(l.y)-2),w=Math.min(source.width-x,Math.ceil(l.w)+4),h=Math.min(source.height-y,Math.ceil(l.h)+4);if(w>0&&h>0)g.drawImage(source,x,y,w,h,x,y,w,h)}}
export function textBoxes(tsv){return String(tsv||'').split('\n').slice(1).map(row=>row.split('\t')).filter(c=>c[0]==='5'&&+c[10]>=25&&c[11]?.trim()).map(c=>({x:+c[6],y:+c[7],w:+c[8],h:+c[9]}));}
