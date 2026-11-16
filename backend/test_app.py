import importlib
import os
import tempfile
import unittest


class InventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.previous = os.environ.get('INVENTORY_DATABASE')
        os.environ['INVENTORY_DATABASE'] = os.path.join(cls.temp.name, 'test.db')
        cls.module = importlib.import_module('app')
        cls.client = cls.module.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()
        if cls.previous is None:
            os.environ.pop('INVENTORY_DATABASE', None)
        else:
            os.environ['INVENTORY_DATABASE'] = cls.previous

    def test_health_and_samples(self):
        self.assertEqual(self.client.get('/api/health').status_code, 200)
        self.assertGreaterEqual(len(self.client.get('/api/inventory').json['products']), 8)

    def test_product_stock_sale_and_history(self):
        payload = dict(name='Test Widget', sku='TEST-001', category='Test', price='12.50', stock=3, threshold=2)
        self.assertEqual(self.client.post('/api/products', json=payload).status_code, 201)
        self.assertEqual(self.client.post('/api/products', json=payload).status_code, 409)
        p = next(p for p in self.client.get('/api/inventory').json['products'] if p['sku']=='TEST-001')
        pid = p['id']
        self.assertEqual(p['price'],1250)
        self.assertEqual(self.client.post('/api/movements',json=dict(product_id=pid,kind='sale',quantity=4)).status_code,409)
        self.assertEqual(self.client.post('/api/movements',json=dict(product_id=pid,kind='sale',quantity=2)).status_code,201)
        self.assertEqual(self.client.post('/api/movements',json=dict(product_id=pid,kind='in',quantity=5)).status_code,201)
        self.assertEqual(self.client.post('/api/movements',json=dict(product_id=pid,kind='out',quantity=1)).status_code,201)
        snapshot=self.client.get('/api/inventory').json
        self.assertEqual(next(p for p in snapshot['products'] if p['id']==pid)['stock'],5)
        self.assertEqual(next(m for m in snapshot['movements'] if m['product_id']==pid and m['kind']=='sale')['total'],2500)
        payload['price']='20.00'
        self.assertEqual(self.client.put(f'/api/products/{pid}',json=payload).status_code,200)
        self.assertEqual(self.client.delete(f'/api/products/{pid}').status_code,409)

    def test_validation_and_delete(self):
        self.assertEqual(self.client.post('/api/movements',json=dict(product_id=1,kind='out',quantity=-1)).status_code,400)
        self.assertEqual(self.client.post('/api/movements',json=dict(product_id=1,kind='out',quantity=1.5)).status_code,400)
        self.assertEqual(self.client.post('/api/products',json=dict(name='Bad',sku='BAD',category='Test',price='NaN',threshold=1)).status_code,400)
        self.assertEqual(self.client.put('/api/products/999999',json={}).status_code,404)
        payload=dict(name='Disposable',sku='DELETE-001',category='Test',price=1,stock=0,threshold=0)
        self.client.post('/api/products',json=payload)
        pid=next(p['id'] for p in self.client.get('/api/inventory').json['products'] if p['sku']=='DELETE-001')
        self.assertEqual(self.client.delete(f'/api/products/{pid}').status_code,200)

    def test_invalid_payloads_return_json_without_server_errors(self):
        valid=dict(name='Valid',sku='VALID',category='Test',price='1.25',stock=1,threshold=1)
        invalid=[dict(name=None),dict(sku=[]),dict(category={}),dict(name=' '*5),dict(price='0.001'),dict(stock=10**30),dict(threshold=True)]
        for change in invalid:
            with self.subTest(change=change):
                response=self.client.post('/api/products',json={**valid,**change})
                self.assertEqual(response.status_code,400)
                self.assertIn('error',response.json)
        for payload in [[],None,dict(product_id=1,kind='in',quantity=10**30),dict(product_id=1,kind='in',quantity=1,note={})]:
            response=self.client.post('/api/movements',json=payload)
            self.assertEqual(response.status_code,400)
            self.assertIn('error',response.json)
        response=self.client.post('/api/products',data='plain text',content_type='text/plain')
        self.assertEqual(response.status_code,400)
        self.assertIn('error',response.json)

    def test_empty_inventory_stays_empty_after_restart(self):
        original=self.module.app.config['DATABASE']
        try:
            self.module.app.config['DATABASE']=os.path.join(self.temp.name,'empty.db')
            self.module.initialize()
            with self.module.connect() as db:
                db.execute('DELETE FROM movements')
                db.execute('DELETE FROM products')
            self.module.initialize()
            self.assertEqual(self.client.get('/api/inventory').json,dict(products=[],movements=[]))
        finally:
            self.module.app.config['DATABASE']=original

    def test_parallel_sales_cannot_oversell(self):
        from concurrent.futures import ThreadPoolExecutor
        self.client.post('/api/products',json=dict(name='Limited Stock',sku='LIMITED',category='Test',price='2.50',stock=1,threshold=0))
        pid=next(p['id'] for p in self.client.get('/api/inventory').json['products'] if p['sku']=='LIMITED')
        def sell(_):
            with self.module.app.test_client() as client:
                return client.post('/api/movements',json=dict(product_id=pid,kind='sale',quantity=1)).status_code
        with ThreadPoolExecutor(max_workers=2) as executor:
            results=list(executor.map(sell,range(2)))
        self.assertEqual(sorted(results),[201,409])
        snapshot=self.client.get('/api/inventory').json
        self.assertEqual(next(p['stock'] for p in snapshot['products'] if p['id']==pid),0)
        self.assertEqual(len([m for m in snapshot['movements'] if m['product_id']==pid]),1)


if __name__ == '__main__':
    unittest.main()
