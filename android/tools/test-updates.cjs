#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),serial=process.argv[2],sdk=process.env.ANDROID_HOME,java=process.env.JAVA_HOME;
if(!serial||!sdk||!java)throw Error('Set ANDROID_HOME and JAVA_HOME, then run: node tools/test-updates.cjs emulator-5556');
const properties=Object.fromEntries(fs.readFileSync(path.join(root,'version.properties'),'utf8').trim().split(/\r?\n/).map(l=>l.split('=')));
const code=Number(properties.versionCode)+1,parts=properties.versionName.split('.').map(Number);parts[2]++;
const gradle=process.env.WEPLAY_GRADLE_BIN||path.join(root,'gradlew'),assets=path.join(root,'app/src/androidTest/assets'),apk=path.join(root,'app/build/outputs/apk/debug/app-debug.apk');
const run=(exe,args,extra={})=>cp.execFileSync(exe,args,{cwd:root,stdio:'inherit',...extra});
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'weplay-update-test-'));
try{
  run(gradle,['assembleDebug','-PtestVersionCode='+code,'-PtestVersionName='+parts.join('.')]);
  fs.mkdirSync(assets,{recursive:true});fs.copyFileSync(apk,path.join(assets,'update-good.apk'));
  const env={...process.env,WEPLAY_TEST_PASSWORD:crypto.randomBytes(24).toString('hex')},key=path.join(temporary,'test.p12');
  run(path.join(java,'bin/keytool'),['-genkeypair','-keystore',key,'-storepass:env','WEPLAY_TEST_PASSWORD','-keypass:env','WEPLAY_TEST_PASSWORD','-alias','test','-keyalg','RSA','-keysize','2048','-validity','30','-dname','CN=WePlay test only'],{env,stdio:'ignore'});
  run(path.join(sdk,'build-tools/35.0.0/apksigner'),['sign','--ks',key,'--ks-pass','env:WEPLAY_TEST_PASSWORD','--key-pass','env:WEPLAY_TEST_PASSWORD','--out',path.join(assets,'update-other-signer.apk'),path.join(assets,'update-good.apk')],{env});
  run(gradle,['assembleDebug','assembleAndroidTest']);
  const adb=path.join(sdk,'platform-tools/adb');
  run(adb,['-s',serial,'install','-r','-d',apk]);
  run(adb,['-s',serial,'install','-r',path.join(root,'app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')]);
  run(adb,['-s',serial,'shell','am','instrument','-w','app.weplay.tv.debug.test/androidx.test.runner.AndroidJUnitRunner']);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
