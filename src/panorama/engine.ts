// Shared verbatim with the isolated on-device WebView and Node synthetic tests.
export const ENGINE_JS = String.raw`
function direction(x,y,w,h) {
 const yaw=(x/w-.5)*Math.PI*2, pitch=(.5-y/h)*Math.PI;
 return [Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)];
}
function project(d,m,f,w,h) {
 const x=m[0]*d[0]+m[3]*d[1]+m[6]*d[2], y=m[1]*d[0]+m[4]*d[1]+m[7]*d[2], z=m[2]*d[0]+m[5]*d[1]+m[8]*d[2];
 if(z>=-.001) return null;
 const u=w/2+f*x/-z, v=h/2-f*y/-z;
 if(u<0||v<0||u>=w-1||v>=h-1) return null;
 const edge=Math.min(u/(w/2),(w-1-u)/(w/2),v/(h/2),(h-1-v)/(h/2));
 return [u,v,Math.max(.0001,edge*edge)];
}
function bilinear(p,w,u,v,c) {
 const x=Math.floor(u),y=Math.floor(v),a=u-x,b=v-y,i=(y*w+x)*4;
 return p[i+c]*(1-a)*(1-b)+p[i+4+c]*a*(1-b)+p[i+w*4+c]*(1-a)*b+p[i+w*4+4+c]*a*b;
}
function accumulate(sum,weights,dirs,rgba,w,h,m,f,start,end) {
 for(let i=start;i<end;i++) {
  const j=i*3,hit=project([dirs[j],dirs[j+1],dirs[j+2]],m,f,w,h);
  if(!hit)continue;
  for(let c=0;c<3;c++)sum[j+c]+=bilinear(rgba,w,hit[0],hit[1],c)*hit[2];
  weights[i]+=hit[2];
 }
}
function resolve(sum,weights) {
 const out=new Uint8ClampedArray(weights.length*4);let covered=0;
 for(let i=0;i<weights.length;i++){out[i*4+3]=255;if(weights[i]>0){covered++;for(let c=0;c<3;c++)out[i*4+c]=sum[i*3+c]/weights[i];}}
 return {rgba:out,coverage:covered/weights.length};
}
`;
export const COMPOSER_HTML = `<!doctype html><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; img-src data:; style-src 'unsafe-inline'"><body><script>${ENGINE_JS}
const W=2048,H=1024,N=W*H,sum=new Float32Array(N*3),weights=new Float32Array(N),dirs=new Float32Array(N*3);
const send=x=>window.ReactNativeWebView.postMessage(JSON.stringify(x));
for(let y=0;y<H;y++)for(let x=0;x<W;x++)dirs.set(direction(x+.5,y+.5,W,H),(y*W+x)*3);
let count=0,total=0;
window.receive=async function(frame){try{
 if(frame.finish){const result=resolve(sum,weights),c=document.createElement('canvas');c.width=W;c.height=H;c.getContext('2d').putImageData(new ImageData(result.rgba,W,H),0,0);send({type:'done',data:c.toDataURL('image/jpeg',.92).split(',')[1],coverage:result.coverage,width:W,height:H});return;}
 const img=new Image();img.src=frame.data;await img.decode();
 const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
 const pixels=ctx.getImageData(0,0,c.width,c.height).data;
 for(let start=0;start<N;start+=65536){accumulate(sum,weights,dirs,pixels,c.width,c.height,frame.matrix,frame.focal,start,Math.min(N,start+65536));await new Promise(r=>setTimeout(r,0));}
 count++;send({type:'next',index:count});
}catch(e){send({type:'error',message:String(e)});}};
send({type:'next',index:0});
</script>`;
export function viewerHTML(data: string) {
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; img-src data:; style-src 'unsafe-inline'"><style>html,body{margin:0;background:#10251f;height:100%;overflow:hidden}canvas{width:100%;height:100%;touch-action:none}p{position:absolute;bottom:18px;width:100%;text-align:center;color:white;font:14px sans-serif;pointer-events:none}</style><canvas id="v"></canvas><p>Drag to look around · use + / − to zoom</p><script>
const img=new Image();img.src=${JSON.stringify(data)};let yaw=0,pitch=0,fov=80,raw,iw,ih;const c=document.getElementById('v'),ctx=c.getContext('2d');c.width=480;c.height=Math.round(480*innerHeight/innerWidth);
img.onload=()=>{const t=document.createElement('canvas');t.width=iw=img.width;t.height=ih=img.height;const tc=t.getContext('2d');tc.drawImage(img,0,0);raw=tc.getImageData(0,0,iw,ih).data;draw();};
img.onerror=()=>window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:'Could not open panorama'}));
function draw(){if(!raw)return;const out=ctx.createImageData(c.width,c.height),f=c.width/(2*Math.tan(fov*Math.PI/360)),cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){let a=(x-c.width/2)/f,b=-(y-c.height/2)/f,z=-1;const n=Math.hypot(a,b,z);a/=n;b/=n;z/=n;const b1=cp*b-sp*z,z1=sp*b+cp*z,a2=cy*a-sy*z1,z2=sy*a+cy*z1;const u=((Math.atan2(a2,-z2)/(2*Math.PI)+.5)*iw+iw)%iw,v=Math.max(0,Math.min(ih-1,(.5-Math.asin(Math.max(-1,Math.min(1,b1)))/Math.PI)*ih));const i=(Math.floor(v)*iw+Math.floor(u))*4,j=(y*c.width+x)*4;out.data[j]=raw[i];out.data[j+1]=raw[i+1];out.data[j+2]=raw[i+2];out.data[j+3]=255;}ctx.putImageData(out,0,0);}
let last,pending=false;c.onpointerdown=e=>{last=[e.clientX,e.clientY];c.setPointerCapture(e.pointerId)};c.onpointerup=()=>last=null;c.onpointercancel=()=>last=null;c.onpointermove=e=>{if(!last)return;yaw-=(e.clientX-last[0])*.006;pitch=Math.max(-1.55,Math.min(1.55,pitch+(e.clientY-last[1])*.006));last=[e.clientX,e.clientY];if(!pending){pending=true;requestAnimationFrame(()=>{draw();pending=false})}};window.zoom=delta=>{fov=Math.max(35,Math.min(110,fov+delta));draw()};
</script>`;
}
