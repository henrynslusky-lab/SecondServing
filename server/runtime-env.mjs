import { AsyncLocalStorage } from 'node:async_hooks';
const context=new AsyncLocalStorage();
export function runWithAgentEnv(env,callback){return context.run(env,callback);}
export function getAgentEnv(){return context.getStore()||{};}
