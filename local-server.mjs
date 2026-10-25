// Local hosting: built-in Node.js only. No public deployment or account required.
import http from 'node:http';
import { readFileSync, existsSync,writeFileSync,unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configuration, extractDonation, coordinateDonation,verifyConnection,setConnectionIssue } from './server/agent.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
for(const filename of ['.env.local','.env'])if(existsSync(path.join(root,filename)))process.loadEnvFile(path.join(root,filename));
const port=Number(process.env.PORT||4173),hosts=[`localhost:${port}`,`127.0.0.1:${port}`];
const connectionStatusPath=path.join(root,'.agent-status.json');
try{if(existsSync(connectionStatusPath))setConnectionIssue(JSON.parse(readFileSync(connectionStatusPath,'utf8')));}catch{}
const localConfiguration=()=>({...configuration(process.env),hosting:'local'});
const files={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/engine.mjs':['engine.mjs','text/javascript'],'/style.css':['style.css','text/css'],'/favicon.svg':['favicon.svg','image/svg+xml'],'/assets/second-serving-logo.png':['assets/second-serving-logo.png','image/png']};
let aiBusy=false;
function send(res,status,data,type='application/json'){
  res.writeHead(status,{'Content-Type':`${type}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});
  res.end(type==='application/json'?JSON.stringify(data):data);
}
export const server=http.createServer(async(req,res)=>{
  if(!hosts.includes(req.headers.host))return send(res,403,{error:'Use the localhost address for this local workspace.'});
  const route=new URL(req.url,`http://localhost:${port}`).pathname;
  if(req.method==='GET'&&files[route]){const [file,type]=files[route];return send(res,200,readFileSync(path.join(root,'public',file)),type);}
  if(req.method==='GET'&&route==='/api/agent/config')return send(res,200,localConfiguration());
  if(req.method!=='POST'||!['/api/agent/extract','/api/agent/coordinate','/api/agent/check'].includes(route))return send(res,404,{error:'Not found.'});
  if(req.headers['x-second-serving']!=='workspace'||req.headers.origin&&!hosts.some(host=>req.headers.origin===`http://${host}`))return send(res,403,{error:'Use the local Second Serving website to run this action.'});
  if(aiBusy)return send(res,409,{error:'An AI action is already running. Please wait.'});
  aiBusy=true;
  try{
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>160000)throw Object.assign(new Error('This workspace is too large. Start a fresh practice.'),{status:413});}
    const body=JSON.parse(raw||'{}');
    const result=route==='/api/agent/check'?await verifyConnection(process.env):route==='/api/agent/extract'?await extractDonation(process.env,body.message):await coordinateDonation(process.env,body.state,body.donationId);
    send(res,200,result);
  }catch(error){send(res,error.status||400,{error:error.message||'The agent action could not be completed.',code:error.code||null,configuration:localConfiguration()});}
  finally{aiBusy=false;try{const issue=configuration(process.env).issue;if(issue)writeFileSync(connectionStatusPath,JSON.stringify(issue));else if(existsSync(connectionStatusPath))unlinkSync(connectionStatusPath);}catch{}}
});
server.on('error',error=>{console.error(`Second Serving could not start: ${error.message}`);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
  console.log(`Second Serving is running at http://localhost:${port}`);
  console.log(configuration(process.env).configured?`${configuration(process.env).provider_name} credential configured locally.`:'Practice coordinator active. Live AI is not connected.');
  console.log('Fictional practice data stays in your browser. Only this computer can connect.');
});
