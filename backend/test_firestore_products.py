
from firestore_service import get_products, get_product

products = get_products()

print("Total products:", len(products))

for product in products:
    print(
        product["id"],
        product["name"],
        product["stock"]
    )

print("Product 1:", get_product(1))
