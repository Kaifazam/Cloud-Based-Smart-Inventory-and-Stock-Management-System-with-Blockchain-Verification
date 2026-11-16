from firebase_config import db

doc_ref = db.collection("connection_tests").document("test1")

doc_ref.set({
    "project": "StockWise",
    "status": "connected"
})

result = doc_ref.get()

print("Firestore data:", result.to_dict())
print("Firestore read/write test successful!")