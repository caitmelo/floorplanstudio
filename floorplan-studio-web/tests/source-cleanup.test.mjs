import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceCrop} from '../web/source-cleanup.mjs';
function pixels(w,h){const a=new Uint8ClampedArray(w*h*4);a.fill(255);return a;}
function black(a,w,x0,y0,rw,rh){for(let y=y0;y<y0+rh;y++)for(let x=x0;x<x0+rw;x++){const i=(y*w+x)*4;a[i]=a[i+1]=a[i+2]=30;}}
test('removes solid side bars before A4 placement',()=>{const a=pixels(1000,600);black(a,1000,0,0,180,600);black(a,1000,820,0,180,600);assert.deepEqual(sourceCrop(a,1000,600),{x:180,y:0,w:640,h:600});});
test('preserves walls and ordinary dark drawing content',()=>{const a=pixels(1000,600);black(a,1000,0,100,200,400);black(a,1000,999,0,1,600);assert.deepEqual(sourceCrop(a,1000,600),{x:0,y:0,w:1000,h:600});});

import {removeOuterFrames} from '../web/source-cleanup.mjs';
function grey(a,w,x,y,rw,rh,value=190){black(a,w,x,y,rw,rh);for(let yy=y;yy<y+rh;yy++)for(let xx=x;xx<x+rw;xx++){const p=(yy*w+xx)*4;a[p]=a[p+1]=a[p+2]=value;}}
test('removes a faint L-shaped outer page frame but preserves enclosed drawing and rules',()=>{const a=pixels(1000,800);grey(a,1000,100,50,1,650);grey(a,1000,100,699,750,1);black(a,1000,300,200,150,150);grey(a,1000,250,600,400,1);const before=a.slice();assert.equal(removeOuterFrames(a,1000,800),1);assert.equal(a[(400*1000+100)*4],255);assert.equal(a[(699*1000+500)*4],255);assert.equal(a[(600*1000+300)*4],190);assert.equal(a[(250*1000+350)*4],before[(250*1000+350)*4]);});
test('preserves dark property boundaries and faint lines attached to drawing',()=>{for(const value of [30,190]){const a=pixels(1000,800);grey(a,1000,100,50,1,650,value);grey(a,1000,100,699,750,1,value);black(a,1000,300,200,150,150);if(value===190)black(a,1000,100,300,250,2);const before=a.slice();assert.equal(removeOuterFrames(a,1000,800),0);assert.deepEqual(a,before);}});
