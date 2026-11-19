import {spawn} from 'node:child_process';
import './build.mjs';
const args=process.argv.slice(2).filter(arg=>arg!=='--strictPort'&&arg!=='--').map(arg=>arg==='--host'||arg==='--hostname'?'--ip':arg);
const child=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev',...args],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exitCode=code??1);

