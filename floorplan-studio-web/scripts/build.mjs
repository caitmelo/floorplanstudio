import {mkdir,cp,rm,copyFile,readFile,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await cp('web','dist/client',{recursive:true});
await writeFile('dist/server/index.js',(await readFile('server/index.mjs','utf8')).replace('../web/hybrid-contract.mjs','./hybrid-contract.mjs'));
await copyFile('web/hybrid-contract.mjs','dist/server/hybrid-contract.mjs');
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built Worker and browser assets.');
