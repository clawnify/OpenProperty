import {build} from 'esbuild';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
const client=await build({entryPoints:['src/client.js'],bundle:true,format:'esm',minify:true,write:false,target:'es2022'});
const assets={'/app.js':['text/javascript; charset=utf-8',Buffer.from(client.outputFiles[0].contents).toString('base64')]};
const files={
 '/style.css':['text/css; charset=utf-8','public/style.css'],
 '/assets/sill.png':['image/png','public/assets/sill.png'],
 '/assets/wordmark.png':['image/png','public/assets/wordmark.png'],
 '/assets/courtyard.webp':['image/webp','public/assets/courtyard.webp'],
 '/assets/dm.woff2':['font/woff2','node_modules/@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2'],
 '/assets/dm-bold.woff2':['font/woff2','node_modules/@fontsource/dm-sans/files/dm-sans-latin-600-normal.woff2'],
 '/assets/serif.woff2':['font/woff2','node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2'],
 '/assets/italic.woff2':['font/woff2','node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2'],
 '/licenses/dm-sans.txt':['text/plain','node_modules/@fontsource/dm-sans/LICENSE'],
 '/licenses/instrument-serif.txt':['text/plain','node_modules/@fontsource/instrument-serif/LICENSE']
};
for(const [route,[type,source]] of Object.entries(files))assets[route]=[type,(await readFile(source)).toString('base64')];
await build({entryPoints:['src/worker.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',minify:true,target:'es2022',platform:'browser',conditions:['workerd','worker','browser'],external:['node:*','cloudflare:*'],define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'sill-assets',setup(b){b.onResolve({filter:/^sill:assets$/},()=>({path:'assets',namespace:'sill'}));b.onLoad({filter:/.*/,namespace:'sill'},()=>({contents:'export default '+JSON.stringify(assets),loader:'js'}));}}]});
console.log('Built SiLL Worker and embedded resident portal assets.');

