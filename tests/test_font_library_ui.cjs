// Real browser + real vector font API; pass PLOTTER_TEST_FONT_DIR for the analyzed library.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const jobs=path.resolve(root,'tests/.testdata/font-ui-'+process.pid);
assert.equal(path.dirname(jobs),path.resolve(root,'tests/.testdata'));
const python=spawn(process.env.PYTHON||'python',['-u','-c',[
  'import sys',
  'from backend.server import Application,create_server',
  'from tests.legacy_machine import TestController',
  'app=Application(sys.argv[1],sys.argv[2],controller=TestController())',
  'server=create_server(app,port=0)',
  'print(server.server_port,flush=True)',
  'server.serve_forever()'
].join('\n'),process.env.PLOTTER_TEST_FONT_DIR||path.resolve(root,'../gcodeFonts'),jobs],{cwd:root,windowsHide:true});
let browser;
(async()=>{
  const port=await new Promise((resolve,reject)=>{
    let output='';python.stdout.on('data',data=>{output+=data;if(/^\d+\r?\n/.test(output))resolve(Number(output.trim()));});
    python.on('error',reject);python.on('exit',code=>reject(new Error('Test server exited: '+code)));
  });
  browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'msedge'});
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  const errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.method()==='POST')requests.push(new URL(request.url()).pathname);});
  await page.goto('http://127.0.0.1:'+port);
  await page.selectOption('#layoutMode','notebook');
  assert.equal(await page.locator('#fontDialog').isVisible(),false);
  await page.locator('#fontSettings>summary').click();
  await page.click('#chooseFonts');
  assert.equal(await page.locator('#fontDialog').isVisible(),true);
  await page.waitForFunction(()=>document.querySelectorAll('#fontGallery svg').length===6);
  await page.waitForFunction(()=>document.querySelectorAll('#fontRecommendation option').length>=7);
  await page.waitForFunction(()=>document.querySelector('#fontMix [data-speed-score]'));
  assert.match(await page.locator('#fontSpeedHint').textContent(),/100 = 字库中位水平/);
  await page.selectOption('#fontSort','speed');
  await page.waitForFunction(()=>document.querySelectorAll('#fontGallery [data-speed-score]').length===6);
  const speedScores=await page.locator('#fontGallery [data-speed-score]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.speedScore)));
  assert.deepEqual(speedScores,[...speedScores].sort((a,b)=>b-a));
  await page.selectOption('#fontSort','name');
  assert.equal(await page.locator('#fontMix svg').count(),1);
  await page.fill('#fontSearch','blood8真迹');
  await page.waitForFunction(()=>[...document.querySelectorAll('#fontGallery .font-card-name')].every(n=>n.textContent.includes('blood8真迹')));
  assert.equal(await page.locator('#fontGallery article').count(),6);
  const first=await page.locator('#fontGallery .font-card-name').first().textContent();
  await page.click('#fontNext');
  assert.notEqual(await page.locator('#fontGallery .font-card-name').first().textContent(),first);
  await page.locator('#fontGallery .font-card-add').first().click();
  assert.equal(await page.locator('#fontMix .font-mix-row').count(),2);
  await page.fill('#fontSampleText','AB😀');
  await page.waitForFunction(()=>document.querySelector('#fontFocus .font-missing')?.textContent.includes('😀'));
  // Hold a previous response to verify it cannot overwrite samples for newer text.
  await page.route('**/api/font-previews',async route=>{
    if(route.request().postDataJSON().text==='永')await new Promise(resolve=>setTimeout(resolve,500));
    await route.continue();
  });
  const previous=page.waitForRequest(request=>request.url().endsWith('/api/font-previews')&&request.postDataJSON()?.text==='永');
  await page.fill('#fontSampleText','永');await previous;
  const latest=page.waitForResponse(response=>response.url().endsWith('/api/font-previews')&&response.request().postDataJSON()?.text==='国');
  await page.fill('#fontSampleText','国');await latest;
  const expected=await page.evaluate(async()=>{
    const font_id=document.querySelector('#font').value;
    return (await (await fetch('/api/font-previews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({font_ids:[font_id],text:'国'})})).json()).previews[0].svg;
  });
  await page.waitForTimeout(700);
  assert.equal(await page.locator('#fontFocus svg').getAttribute('viewBox'),expected.match(/viewBox="([^"]+)"/)[1]);
  assert.equal(await page.locator('#fontFocus polyline').first().getAttribute('points'),expected.match(/polyline points="([^"]+)"/)[1]);
  const saved=await page.evaluate(()=>localStorage.getItem('plotter.font-presets.v1'));
  await page.click('#applyFontRecommendation');
  assert.deepEqual(await page.locator('#fontMix input').evaluateAll(nodes=>nodes.map(n=>Number(n.value))),[60,25,15]);
  assert.equal(await page.evaluate(()=>localStorage.getItem('plotter.font-presets.v1')),saved);
  assert.equal(await page.inputValue('#fontPresetName'),'blood8 真迹 · 自然微差');
  await page.fill('#fontSampleText','春风十里山水清音');
  await page.waitForFunction(()=>document.querySelectorAll('#fontRecommendationPreview svg').length===3&&[...document.querySelectorAll('#fontRecommendationPreview [data-font-preview]')].every(n=>n.dataset.sampleText==='春风十里山水清音'));
  await page.locator('.font-recommendations').screenshot({path:path.resolve(root,'docs/font-browser-preview.png')});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#fontDialog').isVisible(),false);
  assert.equal(await page.locator(':focus').getAttribute('id'),'chooseFonts');
  assert.deepEqual(errors,[]);
  assert.ok(requests.every(p=>['/api/font-previews','/api/coordinate-preview'].includes(p)),requests.join(', '));
  console.log('PASS: actual SVG, paging/search/add, missing glyphs, stale responses, 60/25/15 apply, saved presets and no machine actions');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(browser)await browser.close();
  python.kill();
  await new Promise(resolve=>python.exitCode!==null?resolve():python.once('exit',resolve));
  fs.rmSync(jobs,{recursive:true,force:true});
});
