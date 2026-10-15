const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');
(async()=>{const browser=await chromium.launch({headless:true});try{const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('eb_user',JSON.stringify({id:1,token:'fixture',slug:'demo',display_name:'Camille',role:'freelance'})));
const invoice={id:1,numero:'2026-0001',client_name:'Restaurant Démo',date_emission:'2026-10-01',date_echeance:'2026-10-31',status:'pending_payment',montant_ht:'100.00',montant_ttc:'100.00',tva:'0',finalized_at:'2026-10-01',description:'Service en salle',client_address_ligne1:'1 rue Test',client_code_postal:'75001',client_ville:'Paris',profile_slug:'demo'};
const profile={id:1,slug:'demo',display_name:'Camille',role:'freelance',experiences:[],skills:[],siret:'12345678900012',address_line1:'1 rue Test',postal_code:'75001',city:'Paris',country:'France',services:[]};
await page.route('**/api/**',async route=>{const p=new URL(route.request().url()).pathname;let data=[];
if(p.endsWith('/notifications/'))data={results:[],unread_count:0};
else if(p.endsWith('/members/'))data=[{id:1,name:'Camille',position:'serveur',skills:[],is_active:true,weekly_hours:35,preferences:{}}];
else if(p.endsWith('/restaurants/demo/'))data={id:1,slug:'demo',name:'Restaurant Démo',is_owner:true,is_manager:true};
else if(p.endsWith('/prepare/'))data={created:0};
else if(p.endsWith('/profiles/demo/'))data={mode:'owner',profile,unavailabilities:[]};
else if(p.endsWith('/factures/'))data=[invoice];
await route.fulfill({json:data});});
await page.goto('http://127.0.0.1:5180/resto/demo');await page.getByRole('button',{name:'Services',exact:true}).waitFor();
await page.getByRole('button',{name:'Réduire la navigation'}).click();await page.getByRole('button',{name:'Développer la navigation'}).click();
await page.getByRole('button',{name:'Équipe',exact:true}).click();assert.equal(await page.locator('.eb-app-shell').evaluate(el=>el.classList.contains('eb-shell-enter')),false);assert.equal(await page.getByRole('button',{name:'Équipe',exact:true}).evaluate(el=>getComputedStyle(el).animationName),'none');assert.equal(await page.getByLabel('PIN de Camille').count(),0);
await page.getByLabel('Actions pour Camille').click();await page.getByRole('button',{name:'Gérer le code PIN'}).click();await page.getByLabel('PIN de Camille').waitFor();
await page.goto('http://127.0.0.1:5180/extras/demo?tab=factures');await page.getByRole('heading',{name:'Restaurant Démo'}).waitFor();
assert.equal(await page.getByRole('button',{name:'Réutiliser',exact:true}).count(),0);
await page.getByLabel('Actions de la facture 2026-0001').click();await page.getByRole('button',{name:'Réutiliser',exact:true}).click();await page.getByRole('heading',{name:'Nouvelle facture',exact:true}).waitFor();
assert.equal(await page.getByRole('dialog').count(),0);await page.getByRole('navigation',{name:'Étapes de la facture'}).waitFor();
assert.equal(await page.getByText('Restaurant Démo · Modifier les coordonnées').count(),1);
fs.mkdirSync('e2e/artifacts',{recursive:true});await page.screenshot({path:'e2e/artifacts/ergonomie-facture.png',fullPage:true});
await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
await page.screenshot({path:'e2e/artifacts/ergonomie-mobile.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS: sidebar, team PIN, invoice actions, dedicated invoice screen, known client summary, mobile overflow.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});


