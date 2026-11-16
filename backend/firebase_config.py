
import firebase_admin
from firebase_admin import credentials, firestore
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

if not firebase_admin._apps:
    key_file = BASE_DIR / "firebase-service-account.json"

    if key_file.exists():
        # Local development
        cred = credentials.Certificate(str(key_file))
        firebase_admin.initialize_app(cred)
    else:
        # Google Cloud Run
        firebase_admin.initialize_app()

db = firestore.client()

print("Firebase connected successfully!")
