import sqlite3
from pathlib import Path
from firebase_config import db

BASE_DIR = Path(__file__).resolve().parent
SQLITE_PATH = BASE_DIR / "inventory.db"

def migrate():
    if not SQLITE_PATH.exists():
        raise FileNotFoundError("SQLite database not found")

    connection = sqlite3.connect(SQLITE_PATH)
    connection.row_factory = sqlite3.Row

    try:
        for table in ("products", "movements"):
            records = [
                dict(row)
                for row in connection.execute(
                    f"SELECT * FROM {table}"
                )
            ]

            print(f"Migrating {len(records)} {table}...")

            for record in records:
                document_id = str(record["id"])

                db.collection(table).document(
                    document_id
                ).set(record)

            print(f"{table} migration completed")

        print("Migration writes completed!")

    finally:
        connection.close()

if __name__ == "__main__":
    migrate()