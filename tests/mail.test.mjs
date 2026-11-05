import test from 'node:test';
import assert from 'node:assert/strict';
import {configured,sendMail} from '../src/server/mail.js';

test('SendPulse: refuse unconfigured or unapproved sender',async()=>{
 assert.equal(configured({MAIL_ENABLED:'false',PUBLIC_ORIGIN:'https://kennely.de',SENDPULSE_API_KEY:'fake'}),false);
 const env={MAIL_ENABLED:'true',PUBLIC_ORIGIN:'https://kennely.de',SENDPULSE_API_KEY:'fake-key',MAIL_FROM:'not-approved@example.test'};
 await assert.rejects(sendMail(env,{to:'a@example.test',subject:'Test',text:'Hello'}),/Invalid configured sender/);
});

test('SendPulse: transactional API is server side and respects sender, reply-to and recipient',async()=>{
 const before=globalThis.fetch;let called=0;
 globalThis.fetch=async(url,options)=>{
   called++;assert.equal(url,'https://api.sendpulse.com/smtp/emails');
   assert.equal(options.method,'POST');
   assert.equal(options.headers.Authorization,'Bearer fake-test-key-not-live');
   const payload=JSON.parse(options.body).email;
   assert.equal(payload.from.email,'no-support@kennely.de');
   assert.equal(payload.reply_to.email,'mahmoudbankousli@gmail.com');
   assert.deepEqual(payload.to,[{email:'receiver@example.test'}]);
   assert.equal(payload.text,'This is a test.');
   return new Response(JSON.stringify({result:true,id:'mock-id'}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{
   const result=await sendMail({MAIL_ENABLED:'true',PUBLIC_ORIGIN:'https://kennely.de',SENDPULSE_API_KEY:'fake-test-key-not-live',MAIL_FROM:'no-support@kennely.de',MAIL_REPLY_TO:'mahmoudbankousli@gmail.com',TEST_EMAIL_QUOTA_SKIP:'yes'},
     {to:'receiver@example.test',subject:'Hello',text:'This is a test.'});
   assert.equal(result.ok,true);assert.equal(called,1);
 }finally{globalThis.fetch=before;}
});
