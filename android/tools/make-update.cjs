#!/usr/bin/env node
/* Describe a signed, versioned Android APK. This never reads or publishes signing keys. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const input=process.argv[2],outArg=process.argv.indexOf('--out'),out=path.resolve(outArg>=0?process.argv[outArg+1]:path.join(__dirname,'../..'));
if(!input)throw Error('Usage: node tools/make-update.cjs signed.apk --out repository-root');
const apk=path.resolve(input),sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
if(!sdk)throw Error('Set ANDROID_HOME to your Android SDK.');
const tools=path.join(sdk,'build-tools','35.0.0'),badging=cp.execFileSync(path.join(tools,'aapt'),['dump','badging',apk],{encoding:'utf8'});
const pkg=badging.match(/package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'/),min=badging.match(/sdkVersion:'([0-9]+)'/);
if(!pkg||pkg[1]!=='app.weplay.tv'||!pkg[3].match(/^[0-9]+\.[0-9]+\.[0-9]+$/)||!min)throw Error('Expected a release WePlay Android TV APK.');
const signatures=cp.execFileSync(path.join(tools,'apksigner'),['verify','--verbose','--print-certs',apk],{encoding:'utf8'});
const signer=signatures.match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})/);
if(!signer||!signatures.includes('Verified using v2 scheme (APK Signature Scheme v2): true'))throw Error('APK signature verification failed.');
const bytes=fs.readFileSync(apk),filename='WePlay-AndroidTV-'+pkg[3]+'.apk',sha256=crypto.createHash('sha256').update(bytes).digest('hex');
if(bytes.length>100*1024*1024)throw Error('APK exceeds update size limit.');
const manifest={schema:1,platform:'android-tv',packageName:pkg[1],versionCode:Number(pkg[2]),versionName:pkg[3],minSdk:Number(min[1]),apk:{url:'https://raw.githubusercontent.com/bogdanhpk/WePlay/main/downloads/'+filename,size:bytes.length,sha256,certificateSha256:signer[1]}};
const channel=path.join(out,'updates/android/stable.json');
if(fs.existsSync(channel)){
  const previous=JSON.parse(fs.readFileSync(channel,'utf8'));
  if(previous.versionCode>manifest.versionCode||previous.versionCode===manifest.versionCode&&(previous.apk.sha256!==sha256||previous.versionName!==manifest.versionName))throw Error('Increase versionCode and versionName for a new release.');
  if(previous.apk.certificateSha256!==signer[1])throw Error('Keep the existing Android signing key.');
}
const download=path.join(out,'downloads',filename);fs.mkdirSync(path.dirname(download),{recursive:true});
if(fs.existsSync(download)&&crypto.createHash('sha256').update(fs.readFileSync(download)).digest('hex')!==sha256)throw Error('This version already has another APK. Increase versionCode and versionName.');
if(path.resolve(download)!==apk)fs.copyFileSync(apk,download);
fs.mkdirSync(path.dirname(channel),{recursive:true});
fs.writeFileSync(channel,JSON.stringify(manifest,null,2)+'\n');
const sumFile=path.join(out,'downloads/SHA256SUMS.txt'),sums=new Map();
if(fs.existsSync(sumFile))for(const line of fs.readFileSync(sumFile,'utf8').trim().split('\n')){const m=line.match(/^([a-f0-9]{64})\s+(.+)$/);if(m)sums.set(m[2],m[1]);}
sums.set(filename,sha256);fs.writeFileSync(sumFile,[...sums].map(([name,hash])=>hash+'  '+name).join('\n')+'\n');
console.log(JSON.stringify({version:pkg[3],versionCode:Number(pkg[2]),apk:download,manifest:channel,sha256}));
