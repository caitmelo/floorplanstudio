import {parseRevision,normalize} from './editor-core.mjs';
export function parseAction(input){
 const s=String(input||'').trim().replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[.!]$/,'').replace(/^please\s+/i,'');let m;
 if((m=s.match(/^(?:add|insert|write)\s+(?:(?:text|label)\s+)?['"](.+?)['"](?:\s+in\s+(?:small\s+)?black\s+text)?$/i)))return {type:'text',text:m[1]};
 if((m=s.match(/^(?:change|replace|update|set)\s+(?:(?:the|selected)\s+)*(?:measurements?|dimensions?|text|label)\s+(?:to|with)\s+(.+)$/i)))return {type:'rename',from:'selected text',to:m[1].replace(/^['"]|['"]$/g,'')};
 if((m=s.match(/^(?:relabel|rename|update|change|replace|set)\s+(?:(?:this|selected(?: text|label)?)\s+)?(?:as|to)\s+['"]?(.+?)['"]?$/i)))return {type:'rename',from:'selected text',to:m[1]};
 if(/\b(?:and|then)\s+(?:make|change|update|set|rename|label|add|remove)\b/i.test(s))throw Error('This request needs multiple edits.');
 if((m=s.match(/^(?:label|relabel|name|call)\s+(?:(?:this|it|selected(?: text| label| room)?)\s+)?(?:(?:as|to)\s+)?(.+)$/i)))return {type:'rename',from:'selected text',to:m[1].replace(/^['"]|['"]$/g,'')};
 if(!s)throw Error('Describe a change, or select an element and choose an editing tool.');
 if(/^(remove|delete|erase|clear)\b/i.test(s))return {type:'remove',target:s.replace(/^(remove|delete|erase|clear)\s+/i,'')};
 if((m=s.match(/^(?:move|shift)\s+(.+?)\s+(left|right|up|down)\s+(\d+(?:\.\d+)?)\s*(px|pixels|mm)?$/i))||(m=s.match(/^(?:move|shift)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(px|pixels|mm)?\s+(left|right|up|down)$/i))){if(!/^(left|right|up|down)$/i.test(m[2]))m=[m[0],m[1],m[4],m[2],m[3]];return {type:'move',target:m[1],direction:m[2].toLowerCase(),amount:+m[3],unit:m[4]||'px'}}
 if((m=s.match(/^(?:resize|scale)\s+(.+?)\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*%$/i)))return {type:'resize',target:m[1],scale:+m[2]/100};
 if((m=s.match(/^rotate\s+(.+?)\s+(?:by\s+)?(-?\d+)\s*(?:degrees?|°)?(?:\s+(clockwise|anticlockwise|counterclockwise))?$/i)))return {type:'rotate',target:m[1],angle:+m[2]*(m[3]&&m[3].toLowerCase()!=='clockwise'?-1:1)};
 if((m=s.match(/^(?:add|insert|write)\s+(?:text|label)\s+['"](.+?)['"](?:\s+.*)?$/i)))return {type:'text',text:m[1]};
 if((m=s.match(/^(?:add|draw|insert)\s+(?:a\s+)?(wall|line|door|window)(?:\s+.*)?$/i)))return {type:m[1].toLowerCase()};
 if((m=s.match(/^(?:fill|colou?r|shade|make)\s+(.+?)\s+(?:with\s+)?(white|black|gr[ae]y|light gr[ae]y|dark gr[ae]y)$/i)))return {type:'fill',target:m[1],color:({'white':'#fff','black':'#111','grey':'#aaa','gray':'#aaa','light grey':'#e5e5e5','light gray':'#e5e5e5','dark grey':'#666','dark gray':'#666'})[m[2].toLowerCase()]};
 try{return {type:'rename',...parseRevision(s,true)}}catch{}
 throw Error('I need a specific editing action. You can remove an element, move it right 20px, resize it to 120%, rotate it 90°, add text, or draw a wall, door or window. Select the element on the preview to identify the target.');
}
export const isBrandText=text=>/(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|com\.au|net|au)\b|\b(?:watermark|copyright|real estate|realty|ray white|mcgrath|lj hooker|raine.*horne|belle property|place property|propertyme|diakrit|floorplanner|metropix)\b)/i.test(text);
export const protectedText=text=>/(?:scale|indicative|dimensions|information|accuracy|enquir|site plan|\bfloor\b|internal area|north)/i.test(text);
export function brandCandidates(labels,width,height){return labels.filter(l=>isBrandText(l.text)&&!protectedText(l.text)).map(l=>({...l,automatic:(l.confidence??0)>=65&&(l.y<height*.12||l.y>height*.86||l.x<width*.08||l.x>width*.86)}));}
export function directionOf(s){s=normalize(s);return {right:/\bright\b/.test(s),left:/\bleft\b/.test(s),top:/\b(top|upper)\b/.test(s),bottom:/\b(bottom|lower)\b/.test(s)};}
export function overlaps(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
export function transformedRect(r,action,width,height){let dest={...r};if(action.type==='move'){const distance=action.amount*(action.unit==='mm'?width/297:1);dest.x+=action.direction==='right'?distance:action.direction==='left'?-distance:0;dest.y+=action.direction==='down'?distance:action.direction==='up'?-distance:0}if(action.type==='resize'){if(action.scale<.1||action.scale>4)throw Error('Use a scale between 10% and 400%.');dest.w*=action.scale;dest.h*=action.scale}if(action.type==='rotate'){if(action.angle%90!==0)throw Error('Use 90°, 180° or 270° rotations for this raster editor.');if(Math.abs(action.angle)%180===90){dest.w=r.h;dest.h=r.w}}if(dest.x<0||dest.y<0||dest.x+dest.w>width||dest.y+dest.h>height)throw Error('That change would move part of the element off the page. Choose a smaller movement or size.');return dest;}
