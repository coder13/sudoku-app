// Check the public Collections route, the cold offline error, and Standard offline play.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
const [local, output] = process.argv.slice(2)
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = new URL(local)
assert.ok(['localhost','127.0.0.1'].includes(origin.hostname))
origin.hostname = 'sinclair.test'
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:[
  '--host-resolver-rules=MAP sinclair.test 127.0.0.1','--no-proxy-server',
  '--unsafely-treat-insecure-origin-as-secure='+origin.origin,
]})
try {
  const context=await browser.newContext({viewport:{width:1330,height:900}}), page=await context.newPage()
  const requests=[],errors=[]
  page.on('response', response=>{
    const path=new URL(response.url()).pathname
    if (path.startsWith('/collections/sinclair-library-')) requests.push({path,status:response.status()})
  })
  page.on('pageerror',e=>errors.push(e.message))
  const browse=origin.origin+'/puzzles/collections/?variant=killer-cages&collection=sinclair-library-killer-cages&difficulty=hard'
  await page.goto(browse)
  await page.getByRole('button',{name:'Download 100 puzzles'}).waitFor()
  assert.equal(await page.locator('.collection-puzzle-list > li').count(),100)
  assert.equal(requests.length,0)
  await page.getByRole('button',{name:'Download 100 puzzles'}).click()
  await page.getByText('100 puzzles available offline',{exact:true}).waitFor()
  assert.equal(requests.length,1)
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,undefined,{timeout:60000})
  await context.setOffline(true)
  await page.reload()
  await page.getByRole('link',{name:/Sinclair Killer Hard 001/}).click()
  await page.getByRole('button',{name:'Start puzzle'}).click()
  await page.waitForFunction(()=>{
    const id=localStorage.getItem('sudoku-app:v1:active')
    const game=JSON.parse(localStorage.getItem('sudoku-app:v1:game:'+id))
    return game?.variant?.id==='killer-cages' && document.querySelector('.sudoku-grid')
  })
  await page.evaluate(async()=>{await document.activeViewTransition?.finished})
  const opened=await page.evaluate(()=>{
    const id=localStorage.getItem('sudoku-app:v1:active')
    const game=JSON.parse(localStorage.getItem('sudoku-app:v1:game:'+id))
    return {title:game.title,collection:game.collection,variant:game.variant.id,givens:game.givens}
  })
  assert.equal(opened.variant,'killer-cages')
  assert.equal(opened.givens,'0'.repeat(81))
  await page.goto(origin.origin+'/puzzles/new/')
  await page.locator('.variant-option:visible').filter({has:page.locator('input[value="jigsaw"]')}).click()
  await page.locator('.difficulty-list:visible label').filter({has:page.locator('input[value="medium"]')}).click()
  const option=page.getByRole('checkbox',{name:'Sinclair collection'})
  await option.check()
  await page.locator('.puzzle-start-button:visible').click()
  await page.getByRole('alert').filter({hasText:'Connect to the internet'}).waitFor()
  await option.uncheck()
  await page.locator('.puzzle-start-button:visible').click()
  await page.waitForFunction(()=>{
    const id=localStorage.getItem('sudoku-app:v1:active')
    const game=JSON.parse(localStorage.getItem('sudoku-app:v1:game:'+id))
    return game?.variant?.id==='jigsaw' && game.source==='generated' && !game.generationStyle
  })
  assert.equal(requests.length,1)
  assert.deepEqual(errors,[])
  await writeFile(output,JSON.stringify({browser:browser.version(),packResponses:requests,offlineCollection:opened,
    rowsInPack:100,coldOfflineError:true,standardOfflineVariant:'jigsaw'},null,2)+'\n')
} finally {await browser.close()}
