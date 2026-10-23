import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPreferences} from '../preferences.js';

test('guest choices never persist; accounts isolate settings and pending saves', async () => {
  let identity=null;
  const data=new Map([[1,{}],[2,{}]]),writes=[],events=[];
  const client=createPreferences({schedule:()=>0,cancel:()=>{},notify:type=>events.push(type),request:async(url,options)=>{
    if (!options) return {user:identity,values:data.get(identity?.id)||{}};
    const body=JSON.parse(options.body);
    if (!identity || identity.id!==body.ownerId) throw Object.assign(new Error('session changed'),{status:identity?409:401});
    Object.assign(data.get(identity.id),body.values); writes.push(body);
    return {ok:true};
  }});
  await client.refresh();
  assert.equal(client.setItem('blog-theme','dark'),false);
  await client.flush();assert.deepEqual(writes,[]);assert.equal(client.getItem('blog-theme'),null);
  identity={id:1};await client.refresh();client.setItem('blog-theme','dark');await client.flush();
  assert.equal(data.get(1)['blog-theme'],'dark');
  identity={id:2};await client.refresh();assert.equal(client.getItem('blog-theme'),null);
  client.setItem('blog-theme','light');await client.flush();
  identity={id:1};await client.refresh();assert.equal(client.getItem('blog-theme'),'dark');
  client.setItem('moon-code-size','17');identity={id:2};await client.flush();
  assert.deepEqual(events,['identity']);assert.equal(client.user,null);assert.equal(data.get(2)['moon-code-size'],undefined);
  identity=null;await client.refresh();assert.equal(client.getItem('blog-theme'),null);
});

test('network failure retains pending settings and retries the latest change',async()=>{
  let fail=false;
  const saved={},events=[];
  const client=createPreferences({schedule:()=>0,cancel:()=>{},notify:type=>events.push(type),request:async(url,options)=>{
    if (!options) return {user:{id:1},values:{}};
    if (fail) throw new Error('offline');
    Object.assign(saved,JSON.parse(options.body).values);return {ok:true};
  }});
  await client.refresh();fail=true;client.setItem('blog-theme','dark');await client.flush();assert.deepEqual(events,['error']);
  client.setItem('blog-theme','light');fail=false;await client.flush();assert.equal(saved['blog-theme'],'light');
});
