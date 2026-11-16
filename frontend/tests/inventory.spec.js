import {test, expect} from '@playwright/test';

async function login(page) {
  await page.goto('/');
  await page.getByRole('button', {name:'Enter demo workspace'}).click();
  await expect(page.getByRole('heading', {name:'Inventory overview'})).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(5);
}
async function navigate(page, name) {
  await page.locator('nav').getByRole('button', {name, exact:true}).click();
  await expect(page.getByRole('heading', {name, exact:true})).toBeVisible();
}
async function save(page, name) {
  const response = page.waitForResponse(r=>r.url().includes('/api/') && r.request().method()!=='GET');
  await page.getByRole('dialog').getByRole('button',{name}).click();
  return response;
}

test('demo login validates input, maintains session, and signs out', async ({page})=>{
  await page.goto('/');
  await page.getByLabel('Email address').fill('invalid');
  await page.getByRole('button',{name:'Enter demo workspace'}).click();
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  await page.getByLabel('Email address').fill('admin@stockwise.demo');
  await page.getByLabel('Password').fill('123');
  await page.getByRole('button',{name:'Enter demo workspace'}).click();
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  await page.getByLabel('Password').fill('demo123');
  await page.getByRole('button',{name:'Enter demo workspace'}).click();
  await expect(page.getByRole('heading',{name:'Inventory overview'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Inventory overview'})).toBeVisible();
  await page.getByRole('button',{name:'Sign out'}).click();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
});

test('sample dashboard, filters, navigation, analytics and CSV', async ({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await login(page);
  await expect(page.locator('.stat-value').nth(0)).toHaveText('8');
  await expect(page.locator('.stat-value').nth(1)).toHaveText('₹4,30,745');
  await expect(page.locator('.stat-value').nth(2)).toHaveText('₹56,972');
  await expect(page.locator('.stat-value').nth(3)).toHaveText('3');
  await expect(page.locator('.recharts-area')).toHaveCount(1);
  await page.getByRole('button',{name:'View all products'}).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);
  await page.getByLabel('Search products').fill('ELE-003');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('USB-C Hub');
  await page.getByLabel('Search products').fill('');
  await page.getByLabel('Filter category').selectOption('Office');
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await navigate(page,'Stock movements');
  await expect(page.locator('tbody tr')).toHaveCount(7);
  await navigate(page,'Sales');
  await expect(page.locator('tbody tr')).toHaveCount(7);
  await page.locator('nav').getByRole('button',{name:/Low-stock alerts/}).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tbody')).toContainText('Out of stock');
  await navigate(page,'Reports & analytics');
  await expect(page.locator('.recharts-bar')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toHaveCount(8);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download CSV'}).click();
  const file=await download;
  expect(file.suggestedFilename()).toBe('stockwise-inventory.csv');
  const stream=await file.createReadStream();
  let csv=''; for await(const chunk of stream)csv+=chunk;
  expect(csv).toContain('Stock value INR');
  expect(csv).toContain('Wireless Headphones');
  expect(csv.trim().split('\r\n')).toHaveLength(9);
  expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/desktop-analytics.png',fullPage:true,animations:'disabled'});
});

test('product CRUD, validation, stock movements, sales and alerts stay in sync', async ({page})=>{
  await login(page);
  await navigate(page,'Products');
  await page.getByRole('button',{name:'Add product',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Product name').fill('Browser Test Widget');
  await dialog.getByLabel('SKU',{exact:true}).fill('BROWSER-001');
  await dialog.getByLabel('Unit price').fill('12.50');
  await dialog.getByLabel('Opening stock').fill('3');
  await dialog.getByLabel('Reorder level').fill('2');
  expect((await save(page,'Save product')).status()).toBe(201);
  await expect(dialog).not.toBeVisible();
  let row=page.locator('tbody tr').filter({hasText:'Browser Test Widget'});
  await expect(row).toContainText('₹12.50');
  await row.getByRole('button',{name:'Edit Browser Test Widget'}).click();
  await dialog.getByLabel('Product name').fill('Updated Browser Widget');
  expect((await save(page,'Save product')).status()).toBe(200);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('tbody')).toContainText('Updated Browser Widget');
  await page.getByRole('button',{name:'Add product',exact:true}).click();
  await dialog.getByLabel('Product name').fill('Duplicate Widget');
  await dialog.getByLabel('SKU',{exact:true}).fill('BROWSER-001');
  await dialog.getByLabel('Unit price').fill('1');
  expect((await save(page,'Save product')).status()).toBe(409);
  await expect(dialog.getByRole('alert')).toContainText('SKU already exists');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await navigate(page,'Stock movements');
  const snapshot=await (await page.request.get('/api/inventory')).json();
  const id=snapshot.products.find(p=>p.sku==='BROWSER-001').id;
  async function transact(kind,quantity){
    await page.getByRole('button',{name:'Record movement',exact:true}).click();
    await dialog.getByLabel('Product',{exact:true}).selectOption(String(id));
    await dialog.getByLabel('Movement type').selectOption(kind);
    await dialog.getByLabel('Quantity').fill(String(quantity));
    return save(page,'Save transaction');
  }
  expect((await transact('out',4)).status()).toBe(409);
  await expect(dialog.getByRole('alert')).toContainText('Insufficient stock');
  await dialog.getByLabel('Quantity').fill('1');
  expect((await save(page,'Save transaction')).status()).toBe(201);
  await expect(dialog).not.toBeVisible();
  await page.locator('nav').getByRole('button',{name:/Low-stock alerts/}).click();
  await expect(page.locator('tbody')).toContainText('Updated Browser Widget');
  await page.getByRole('button',{name:'Restock',exact:true}).click();
  await dialog.getByLabel('Product',{exact:true}).selectOption(String(id));
  await dialog.getByLabel('Quantity').fill('5');
  expect((await save(page,'Save transaction')).status()).toBe(201);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('tbody')).not.toContainText('Updated Browser Widget');
  await navigate(page,'Sales');
  await page.getByRole('button',{name:'Record sale',exact:true}).click();
  await dialog.getByLabel('Product',{exact:true}).selectOption(String(id));
  await dialog.getByLabel('Quantity').fill('2');
  await expect(dialog.locator('.sale-total')).toContainText('₹25');
  expect((await save(page,'Save transaction')).status()).toBe(201);
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('tbody tr').first()).toContainText('Updated Browser Widget');
  await expect(page.locator('tbody tr').first()).toContainText('₹25');
  const final=await (await page.request.get('/api/inventory')).json();
  expect(final.products.find(p=>p.id===id).stock).toBe(5);
  await page.locator('nav').getByRole('button',{name:'Overview',exact:true}).click();
  await expect(page.locator('.stat-value').nth(2)).toHaveText('₹56,997');
  await navigate(page,'Products');
  page.on('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Delete Updated Browser Widget',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('transaction history');
  await page.getByRole('button',{name:'Add product',exact:true}).click();
  await dialog.getByLabel('Product name').fill('Disposable Widget');
  await dialog.getByLabel('SKU',{exact:true}).fill('DELETE-BROWSER');
  await dialog.getByLabel('Unit price').fill('1');
  await save(page,'Save product');
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:'Delete Disposable Widget',exact:true}).click();
  await expect(page.locator('tbody')).not.toContainText('Disposable Widget');
});

test('mobile navigation and API failure recovery', async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await login(page);
  await page.getByRole('button',{name:'Open navigation'}).click();
  await navigate(page,'Products');
  await expect(page.locator('.sidebar')).not.toHaveClass(/open/);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'test-results/mobile-products.png',fullPage:true,animations:'disabled'});
  await page.route('**/api/inventory',r=>r.abort());
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Cannot reach the backend');
  await page.unroute('**/api/inventory');
  await page.getByRole('button',{name:'Retry'}).click();
  await expect(page.getByRole('alert')).not.toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(5);
});

test('empty inventory remains usable with zero totals and no products', async ({page})=>{
  await page.route('**/api/inventory',r=>r.fulfill({json:{products:[],movements:[]}}));
  await page.goto('/');
  await page.getByRole('button',{name:'Enter demo workspace'}).click();
  await expect(page.locator('.stat-value').nth(0)).toHaveText('0');
  await expect(page.locator('.stat-value').nth(1)).toHaveText('₹0');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await expect(page.locator('.empty')).toHaveText('No products match this view.');
  await navigate(page,'Stock movements');
  await page.getByRole('button',{name:'Record movement',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('button',{name:'Save transaction'})).toBeDisabled();
});
