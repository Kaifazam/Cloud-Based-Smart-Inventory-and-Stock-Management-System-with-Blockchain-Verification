
import hashlib
import json


def calculate_hash(record):
    text = json.dumps(
        record,
        sort_keys=True,
        separators=(",", ":")
    )
    return hashlib.sha256(
        text.encode("utf-8")
    ).hexdigest()


def verify_chain(records):
    previous_hash = "0"

    for record in records:
        # Exclude the stored hash itself.
        content = {
            key: value
            for key, value in record.items()
            if key != "hash"
        }

        # Verify that records are correctly linked.
        if content.get("previous_hash") != previous_hash:
            return False

        # Verify the transaction hash.
        expected_hash = calculate_hash(content)

        if expected_hash != record.get("hash"):
            return False

        previous_hash = record["hash"]

    return True
