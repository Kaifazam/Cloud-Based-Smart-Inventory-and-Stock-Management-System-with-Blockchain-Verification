"""Phase 1 local demo API. Authentication and blockchain arrive in later phases."""
import os
import sqlite3
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from contextlib import contextmanager
from flask import Flask, jsonify, request
from firebase_config import db
from firestore_service import get_products, get_movements
from firestore_service import add_product
from blockchain import verify_chain
from firestore_service import (
    delete_product,
    record_movement,
    InventoryError
)


app = Flask(__name__)
app.config['DATABASE'] = os.environ.get('INVENTORY_DATABASE', str(Path(__file__).with_name('inventory.db')))

@contextmanager
def connect():
    db = sqlite3.connect(app.config['DATABASE'])
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA foreign_keys = ON')
    try:
        with db:
            yield db
    finally:
        db.close()


@app.get('/api/firestore/inventory')
def firestore_inventory():
    try:
        products = get_products()
        movements = get_movements()

        return jsonify(
            products=products,
            movements=movements,
            source="firestore"
        )

    except Exception:
        app.logger.exception("Firestore inventory failed")
        return jsonify(
            error="Failed to fetch Firestore inventory"
        ), 500
@app.post('/api/firestore/products')
def firestore_add_product():
    try:
        data = request.get_json()

        if not isinstance(data, dict):
            return jsonify(error="Invalid JSON"), 400

        name = text_field(data, "name", 120)
        sku = text_field(data, "sku", 40).upper()
        category = text_field(data, "category", 80)

        price = Decimal(str(data.get("price", "")))

        if not price.is_finite() or price < 0 or price > 100000000:
            raise ValueError("Invalid price")

        if price * 100 != (price * 100).to_integral_value():
            raise ValueError("Price must have at most two decimal places")

        stock = integer(data.get("stock", 0), "Stock")
        threshold = integer(data.get("threshold"), "Threshold")

        product_data = {
            "name": name,
            "sku": sku,
            "category": category,
            "price": int(price * 100),
            "stock": stock,
            "threshold": threshold
        }

        product_id = add_product(product_data)

        return jsonify(
            success=True,
            id=product_id
        ), 201

    except (ValueError, InvalidOperation) as e:
        return jsonify(error=str(e)), 400

    except Exception:
        app.logger.exception("Firestore product creation failed")
        return jsonify(error="Failed to create product"), 500
@app.put('/api/firestore/products/<int:pid>')
def firestore_update_product(pid):
    try:
        data = request.get_json()

        if not isinstance(data, dict):
            return jsonify(error="Invalid JSON"), 400

        name = text_field(data, "name", 120)
        sku = text_field(data, "sku", 40).upper()
        category = text_field(data, "category", 80)

        price = Decimal(str(data.get("price", "")))

        if not price.is_finite() or price < 0 or price > 100000000:
            raise ValueError("Invalid price")

        if price * 100 != (price * 100).to_integral_value():
            raise ValueError("Price must have at most two decimal places")

        threshold = integer(data.get("threshold"), "Threshold")

        product_ref = db.collection("products").document(str(pid))

        if not product_ref.get().exists:
            return jsonify(error="Product not found"), 404

        product_ref.update({
            "name": name,
            "sku": sku,
            "category": category,
            "price": int(price * 100),
            "threshold": threshold
        })

        return jsonify(success=True)

    except (ValueError, InvalidOperation) as e:
        return jsonify(error=str(e)), 400

    except Exception:
        app.logger.exception("Firestore update failed")
        return jsonify(error="Failed to update product"), 500

@app.delete("/api/firestore/products/<int:pid>")
def firestore_delete_product(pid):
    try:
        delete_product(pid)
        return jsonify(success=True)

    except InventoryError as error:
        return jsonify(error=str(error)), error.status

    except Exception:
        app.logger.exception("Firestore delete failed")
        return jsonify(error="Failed to delete product"), 500


@app.post("/api/firestore/movements")
def firestore_create_movement():
    try:
        data = request.get_json()

        if not isinstance(data, dict):
            return jsonify(error="Invalid JSON"), 400

        pid = integer(data.get("product_id"), "Product", 1)
        quantity = integer(data.get("quantity"), "Quantity", 1)

        kind = data.get("kind")

        if kind not in ("in", "out", "sale"):
            raise ValueError("Invalid movement type")

        note = data.get("note", "")

        if not isinstance(note, str) or len(note) > 250:
            raise ValueError("Invalid note")

        movement_id = record_movement(
            pid, kind, quantity, note.strip()
        )

        return jsonify(
            success=True,
            id=movement_id
        ), 201

    except InventoryError as error:
        return jsonify(error=str(error)), error.status

    except ValueError as error:
        return jsonify(error=str(error)), 400

    except Exception:
        app.logger.exception("Firestore movement failed")
        return jsonify(error="Failed to record movement"), 500

def initialize():
    with connect() as db:
        db.executescript('''CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT UNIQUE NOT NULL,
          category TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>=0),
          stock INTEGER NOT NULL CHECK(stock>=0), threshold INTEGER NOT NULL CHECK(threshold>=0));
          CREATE TABLE IF NOT EXISTS movements (id INTEGER PRIMARY KEY,
          product_id INTEGER NOT NULL REFERENCES products(id), kind TEXT NOT NULL,
          quantity INTEGER NOT NULL, total INTEGER NOT NULL DEFAULT 0, note TEXT,
          created_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);''')
        seeded = db.execute("SELECT value FROM settings WHERE key='sample_data_initialized'").fetchone()
        if not seeded and db.execute('SELECT count(*) FROM products').fetchone()[0] == 0:
            db.executemany('INSERT INTO products(name,sku,category,price,stock,threshold) VALUES(?,?,?,?,?,?)', [
              ('Wireless Headphones','ELE-001','Electronics',249900,48,10),
              ('Mechanical Keyboard','ELE-002','Electronics',399900,24,8),
              ('USB-C Hub','ELE-003','Electronics',149900,6,10),
              ('Desk Organizer','OFF-001','Office',79900,62,15),
              ('Ergonomic Chair','FUR-001','Furniture',899900,12,5),
              ('LED Desk Lamp','OFF-002','Office',129900,8,10),
              ('Cotton Tote Bag','ACC-001','Accessories',39900,95,20),
              ('Laptop Stand','ACC-002','Accessories',189900,0,8)])
            for days, pid, qty, price in [(6,1,3,249900),(5,2,2,399900),(4,4,6,79900),(3,1,5,249900),(2,5,1,899900),(1,7,8,39900),(0,2,3,399900)]:
                db.execute('INSERT INTO movements(product_id,kind,quantity,total,note,created_at) VALUES(?,?,?,?,?,?)',
                 (pid,'sale',qty,qty*price,'Sample sale', (datetime.now(timezone.utc)-timedelta(days=days)).isoformat()))
        db.execute("INSERT OR IGNORE INTO settings(key,value) VALUES('sample_data_initialized','true')")

@app.errorhandler(400)
@app.errorhandler(415)
def bad_request(error):
    return jsonify(error='Invalid request body.'), 400

@app.get('/api/health')
def health():
    return jsonify(status='ok', mode='Phase 1 demo')


@app.get('/api/inventory')
def inventory():
    try:
        products = get_products()
        movements = get_movements()

        return jsonify(
            products=products,
            movements=movements,
            source="firestore"
        )

    except Exception:
        app.logger.exception("Failed to load inventory")
        return jsonify(
            error="Failed to load inventory"
        ), 500


def integer(value, label, minimum=0):
    if isinstance(value, bool) or not str(value).isascii() or not str(value).isdigit() or len(str(value))>7 or not minimum <= int(value) <= 1000000:
        raise ValueError(f'{label} must be a whole number between {minimum} and 1,000,000.')
    return int(value)

def text_field(data, key, limit):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > limit:
        raise ValueError(f'{key.capitalize()} must be text between 1 and {limit} characters.')
    return value.strip()

@app.route('/api/products', methods=['POST'])
@app.route('/api/products/<int:pid>', methods=['PUT','DELETE'])
def product(pid=None):
    try:
        with connect() as db:
            if pid is not None and not db.execute('SELECT id FROM products WHERE id=?',(pid,)).fetchone():
                return jsonify(error='Product not found.'),404
            if request.method == 'DELETE':
                if db.execute('SELECT id FROM movements WHERE product_id=?',(pid,)).fetchone():
                    return jsonify(error='Products with transaction history cannot be deleted.'),409
                db.execute('DELETE FROM products WHERE id=?',(pid,))
            else:
                data=request.get_json()
                if not isinstance(data,dict): raise ValueError('A JSON object is required.')
                name=text_field(data,'name',120); sku=text_field(data,'sku',40).upper(); category=text_field(data,'category',80)
                price=Decimal(str(data.get('price','')))
                if not price.is_finite() or price<0 or price>100000000: raise ValueError('Enter a valid price.')
                if price*100 != (price*100).to_integral_value(): raise ValueError('Price must have at most two decimal places.')
                cents=int(price*100)
                threshold=integer(data.get('threshold'), 'Reorder level')
                if pid is None:
                    stock=integer(data.get('stock',0),'Opening stock')
                    db.execute('INSERT INTO products(name,sku,category,price,stock,threshold) VALUES(?,?,?,?,?,?)',(name,sku,category,cents,stock,threshold))
                else:
                    db.execute('UPDATE products SET name=?,sku=?,category=?,price=?,threshold=? WHERE id=?',(name,sku,category,cents,threshold,pid))
        return jsonify(success=True),201 if request.method=='POST' else 200
    except ValueError as error:
        return jsonify(error=str(error)),400
    except InvalidOperation:
        return jsonify(error='Enter a valid nonnegative price with at most two decimal places.'),400
    except sqlite3.IntegrityError:
        return jsonify(error='This SKU already exists.'),409

@app.post('/api/movements')
def movement():
    try:
        data=request.get_json()
        if not isinstance(data,dict): raise ValueError('A JSON object is required.')
        qty=integer(data.get('quantity'),'Quantity',1)
        pid=integer(data.get('product_id'),'Product',1)
        kind=data.get('kind')
        if kind not in ('in','out','sale'): raise ValueError('Choose a valid movement type.')
        note=data.get('note','')
        if not isinstance(note,str) or len(note)>250: raise ValueError('Note must be text of at most 250 characters.')
        with connect() as db:
            db.execute('BEGIN IMMEDIATE')
            p=db.execute('SELECT * FROM products WHERE id=?',(pid,)).fetchone()
            if not p: return jsonify(error='Product not found.'),404
            if kind!='in' and p['stock']<qty: return jsonify(error='Insufficient stock for this transaction.'),409
            if kind=='in' and p['stock']+qty>1000000: raise ValueError('Stock cannot exceed 1,000,000 units.')
            db.execute('UPDATE products SET stock=stock+? WHERE id=?',(qty if kind=='in' else -qty,pid))
            db.execute('INSERT INTO movements(product_id,kind,quantity,total,note,created_at) VALUES(?,?,?,?,?,?)',(pid,kind,qty,qty*p['price'] if kind=='sale' else 0,note.strip(),datetime.now(timezone.utc).isoformat()))
        return jsonify(success=True),201
    except ValueError as error: return jsonify(error=str(error)),400

@app.get("/api/blockchain/verify")
def blockchain_verify():
    try:
        records = []

        docs = db.collection("movements").stream()

        for doc in docs:
            movement = doc.to_dict()

            if "hash" in movement:
                records.append(movement)

        records.sort(key=lambda m: int(m["id"]))

        if not records:
            return jsonify({
                "verified": False,
                "transactions_checked": 0,
                "message": "No hashed transactions found"
            })

        valid = verify_chain(records)

        return jsonify({
            "verified": valid,
            "transactions_checked": len(records),
            "message": (
                "Blockchain verification successful"
                if valid else "Transaction integrity check failed"
            )
        })

    except Exception:
        app.logger.exception("Blockchain verification failed")
        return jsonify({
            "error": "Blockchain verification failed"
        }), 500


initialize()
if __name__=='__main__':
    app.run(host='127.0.0.1',port=5000,debug=False)
