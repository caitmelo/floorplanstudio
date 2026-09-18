// Crop only continuous, near-solid dark columns touching the source edges.
export function sourceCrop(data,width,height){
 const darkColumn=x=>{let dark=0;for(let y=0;y<height;y++){const i=(y*width+x)*4;if(data[i+3]>240&&Math.max(data[i],data[i+1],data[i+2])<65)dark++;}return dark/height>.98;};
 let left=0,right=width;
 while(left<width*.35&&darkColumn(left))left++;
 while(right>width*.65&&darkColumn(right-1))right--;
 const min=Math.max(3,Math.floor(width*.015));
 if(left<min||left>=width*.35)left=0;
 if(width-right<min||right<=width*.65)right=width;
 return {x:left,y:0,w:right-left,h:height};
}

// Remove only isolated, faint page-sized frames, never individual drawing lines.
// Require a connected corner spanning both axes; straight rules alone stay.
export function removeOuterFrames(data,width,height){
 const seen=new Uint8Array(width*height),frames=[];
 const ink=p=>data[p*4+3]>240&&Math.min(data[p*4],data[p*4+1],data[p*4+2])<=245;
 const thickness=Math.max(3,Math.ceil(Math.min(width,height)*.002));
 for(let n=0;n<width*height;n++){
  if(seen[n]||!ink(n))continue;
  const points=[n];seen[n]=1;let left=width,right=0,top=height,bottom=0,darkest=255;
  for(let i=0;i<points.length;i++){
   const p=points[i],x=p%width,y=Math.floor(p/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);darkest=Math.min(darkest,data[p*4],data[p*4+1],data[p*4+2]);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,k=yy*width+xx;if(xx<0||xx>=width||yy<0||yy>=height||seen[k]||!ink(k))continue;seen[k]=1;points.push(k);}
  }
  if(darkest<130||right-left<width*.3||bottom-top<height*.5||points.length>4*thickness*(right-left+bottom-top))continue;
  if(!points.every(p=>{const x=p%width,y=Math.floor(p/width);return Math.min(x-left,right-x,y-top,bottom-y)<=thickness;}))continue;
  // A page frame must enclose substantial darker drawing content.
  let inside=0;for(let y=top+thickness+2;y<bottom-thickness-2;y+=4)for(let x=left+thickness+2;x<right-thickness-2;x+=4){const p=(y*width+x)*4;if(Math.min(data[p],data[p+1],data[p+2])<100)inside++;}
  if(inside<100)continue;
  frames.push(points);
 }
 for(const points of frames)for(const p of points){const x=p%width,y=Math.floor(p/width);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const k=(yy*width+xx)*4;if(Math.min(data[k],data[k+1],data[k+2])>=130)data[k]=data[k+1]=data[k+2]=255;}}
 return frames.length;
}
