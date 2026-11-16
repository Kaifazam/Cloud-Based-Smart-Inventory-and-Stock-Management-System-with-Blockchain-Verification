
from firebase_config import db
from google.cloud import firestore
from blockchain import calculate_hash

def get_products():
    products = []

    for doc in db.collection("products").stream():
        product = doc.to_dict()
        product["id"] = int(product.get("id", doc.id))
        products.append(product)

    return sorted(products, key=lambda p: p["id"], reverse=True)


def get_movements():
    movements = []

    for doc in db.collection("movements").stream():
        movement = doc.to_dict()

        if "id" not in movement:
            movement["id"] = doc.id

        movements.append(movement)

    return movements


def get_product(product_id):
    for product in get_products():
        if product["id"] == int(product_id):
            return product

    return None


def add_product(product):
    products_ref = db.collection("products")

    @firestore.transactional
    def create(transaction):
        counter_ref = db.collection("metadata").document("product_counter")
        counter_snapshot = counter_ref.get(transaction=transaction)

        if counter_snapshot.exists:
            last_id = counter_snapshot.to_dict().get("last_id", 0)
        else:
            # Initialize from migrated products before first use.
            existing = get_products()
            last_id = max((p["id"] for p in existing), default=0)

        new_id = int(last_id) + 1
        product["id"] = new_id

        transaction.set(products_ref.document(str(new_id)), product)
        transaction.set(counter_ref, {"last_id": new_id})

        return product

    return create(db.transaction())


def update_product(product_id, updates):
    product = get_product(product_id)

    if product is None:
        return None

    docs = db.collection("products").where(
        filter=firestore.FieldFilter("id", "==", int(product_id))
    ).limit(1).stream()

    for doc in docs:
        doc.reference.update(updates)
        product.update(updates)
        return product

    return None


def delete_product(product_id):
    docs = db.collection("products").where(
        filter=firestore.FieldFilter("id", "==", int(product_id))
    ).limit(1).stream()

    for doc in docs:
        doc.reference.delete()
        return True

    return False

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

def get_product(product_id):
    doc = db.collection("products").document(str(product_id)).get()
    return doc.to_dict() if doc.exists else None


def add_product(product):
    counter_ref = db.collection("metadata").document("product_counter")

    @firestore.transactional
    def create(transaction):
        snapshot = counter_ref.get(transaction=transaction)
        last_id = int(snapshot.to_dict()["last_id"])

        new_id = last_id + 1
        product_data = {**product, "id": new_id}

        # Check SKU uniqueness before creating the product.
        sku_query = db.collection("products").where(
            filter=FieldFilter("sku", "==", product_data["sku"])
        )
        if list(sku_query.limit(1).stream(transaction=transaction)):
            raise ValueError("This SKU already exists.")

        transaction.set(
            db.collection("products").document(str(new_id)),
            product_data
        )
        transaction.update(counter_ref, {"last_id": new_id})

        return product_data

    return create(db.transaction())


def update_product(product_id, updates):
    ref = db.collection("products").document(str(product_id))

    if not ref.get().exists:
        return None

    ref.update(updates)
    return True


def delete_product(product_id):
    ref = db.collection("products").document(str(product_id))

    if not ref.get().exists:
        return False

    ref.delete()
    return True

from google.cloud import firestore as google_firestore

@google_firestore.transactional
def _create_product_transaction(transaction, counter_ref, product_data):
    counter_snapshot = counter_ref.get(transaction=transaction)
    last_id = counter_snapshot.get("last_id") if counter_snapshot.exists else 0

    new_id = int(last_id) + 1
    product_ref = db.collection("products").document(str(new_id))

    transaction.set(product_ref, {
        "id": new_id,
        **product_data
    })

    transaction.set(counter_ref, {"last_id": new_id})

    return new_id


def add_product(data):
    counter_ref = db.collection("_metadata").document("product_counter")
    transaction = db.transaction()

    return _create_product_transaction(
        transaction,
        counter_ref,
        data
    )

from datetime import datetime, timezone
from google.cloud import firestore
from firebase_config import db


class InventoryError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


@firestore.transactional
def _delete_product_tx(transaction, product_ref, movement_refs):
    snapshot = product_ref.get(transaction=transaction)

    if not snapshot.exists:
        raise InventoryError("Product not found.", 404)

    # Protect historical transactions.
    # The caller checks for history before this transaction.
    if movement_refs:
        raise InventoryError(
            "Products with transaction history cannot be deleted.", 409
        )

    transaction.delete(product_ref)


def delete_product(pid):
    product_ref = db.collection("products").document(str(pid))

    # Query existing history.
    history = list(
        db.collection("movements")
        .where("product_id", "==", pid)
        .limit(1)
        .stream()
    )

    if history:
        raise InventoryError(
            "Products with transaction history cannot be deleted.", 409
        )

    transaction = db.transaction()
    _delete_product_tx(transaction, product_ref, history)


@firestore.transactional
def _record_movement_tx(
    transaction, product_ref, counter_ref,
    movement_collection, pid, kind, quantity, note
):
    product = product_ref.get(transaction=transaction)
    counter = counter_ref.get(transaction=transaction)

    chain_ref = db.collection("_metadata").document("blockchain_head")
    chain_snapshot = chain_ref.get(transaction=transaction)

    previous_hash = (
        chain_snapshot.to_dict().get("hash", "0")
        if chain_snapshot.exists else "0"
    )

    if not product.exists:
        raise InventoryError("Product not found.", 404)

    data = product.to_dict()
    current_stock = int(data["stock"])

    if kind == "in":
        new_stock = current_stock + quantity
        if new_stock > 1000000:
            raise InventoryError("Stock limit exceeded.")
    else:
        if current_stock < quantity:
            raise InventoryError("Insufficient stock.", 409)
        new_stock = current_stock - quantity

    last_id = int(counter.to_dict().get("last_id", 0)) if counter.exists else 0
    new_id = last_id + 1

    movement_ref = movement_collection.document(str(new_id))

    total = quantity * int(data["price"]) if kind == "sale" else 0

    transaction.update(product_ref, {"stock": new_stock})

    
    movement_data = {
        "id": new_id,
        "product_id": pid,
        "name": data["name"],
        "kind": kind,
        "quantity": quantity,
        "total": total,
        "note": note,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "previous_hash": previous_hash
    }

    movement_data["hash"] = calculate_hash(movement_data)

    transaction.set(movement_ref, movement_data)

    transaction.set(chain_ref, {
        "hash": movement_data["hash"],
        "last_id": new_id
    })


    transaction.set(counter_ref, {"last_id": new_id})

    return new_id


def record_movement(pid, kind, quantity, note=""):
    product_ref = db.collection("products").document(str(pid))
    counter_ref = db.collection("_metadata").document("movement_counter")

    transaction = db.transaction()

    return _record_movement_tx(
        transaction,
        product_ref,
        counter_ref,
        db.collection("movements"),
        pid,
        kind,
        quantity,
        note
    )
