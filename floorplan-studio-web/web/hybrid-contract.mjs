export const FIXTURES=['bbq','car','toilet','sink','bath','shower'];
export const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function splitInstructions(text){
 const parts=[];let current='',quote=null;
 for(let i=0;i<text.length;i++){const ch=text[i];if(/["“”]/.test(ch)){quote=quote?null:'"';current+=ch;continue}if(ch==="'"&&(!quote)&&(i===0||/\s/.test(text[i-1]))){quote="'";current+=ch;continue}if(ch==="'"&&quote==="'"){quote=null;current+=ch;continue}
 if(!quote){const tail=text.slice(i),match=tail.match(/^(?:\s+(?:and\s+then|and|then)\s+|[;,\n]+\s*|\.\s+)(?=(?:please\s+)?(?:rename|relabel|update|set|replace|change|remove|delete|erase|add|insert|put|place|move|shift|rotate|resize|draw|fill)\b)/i);if(match){if(current.trim())parts.push(current.trim());current='';i+=match[0].length-1;continue}}current+=ch;}
 if(current.trim())parts.push(current.trim());if(parts.length>10)throw Error('Please keep one submission to 10 revisions or fewer.');return parts;
}
export function parseFixture(instruction){const m=instruction.trim().match(/^(?:please\s+)?(?:add|insert|put|place)\s+(?:(?:a|an|another|second|one|new)\s+)?(?:built[ -]?in\s+)?(bbq|barbecue|barbeque|car|toilet|sink|bath|shower)(?:\s+icon)?\b(.*)$/i);if(!m)return null;return {type:'fixture',fixture:/barbe?cue|barbeque/i.test(m[1])?'bbq':m[1].toLowerCase(),target:m[2].trim(),instruction};}
export function boxesOverlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
export function within(inner,outer){return inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.w<=outer.x+outer.w&&inner.y+inner.h<=outer.y+outer.h;}
export function validatePlan(plan,width,height,selection=null){
 if(!plan||!Array.isArray(plan.operations)||plan.operations.length>10||typeof plan.message!=='string')throw Error('AI returned an invalid edit plan. Nothing was changed.');
 for(const op of plan.operations){if(!['rename','remove','fixture'].includes(op.type))throw Error('The suggested action is not supported safely. Nothing was changed.');if(typeof op.text!=='string'||op.text.length>120||typeof op.labelId!=='string')throw Error('Invalid text instruction.');if(op.type==='rename'){if(!op.labelId||!op.text.trim())throw Error('A rename needs a recognised label and its new text.');continue}
 if(!op.rect||!['x','y','w','h'].every(k=>Number.isFinite(op.rect[k]))||op.rect.w<2||op.rect.h<2||!within(op.rect,{x:0,y:0,w:width,h:height*199/210}))throw Error('The proposed edit is outside the drawing area. Nothing was changed.');
 if(selection&&!within(op.rect,selection))throw Error('The proposed edit extends outside your selection. Nothing was changed.');
 if(op.type==='fixture'&&!FIXTURES.includes(op.fixture))throw Error('That fixture is not in the approved symbol set.');}
 return plan;
}
export const PLAN_SCHEMA={type:'object',additionalProperties:false,properties:{message:{type:'string'},operations:{type:'array',maxItems:10,items:{type:'object',additionalProperties:false,properties:{type:{type:'string',enum:['rename','remove','fixture']},labelId:{type:'string'},text:{type:'string'},fixture:{type:'string',enum:['','bbq','car','toilet','sink','bath','shower']},rect:{type:'object',additionalProperties:false,properties:{x:{type:'number'},y:{type:'number'},w:{type:'number'},h:{type:'number'}},required:['x','y','w','h']}},required:['type','labelId','text','fixture','rect']}}},required:['message','operations']};
