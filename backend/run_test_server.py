"""Start an isolated demo API for browser tests without touching inventory.db."""
import os
import tempfile

with tempfile.TemporaryDirectory(prefix='stockwise-e2e-') as directory:
    os.environ['INVENTORY_DATABASE'] = os.path.join(directory, 'inventory.db')
    from app import app
    app.run(host='127.0.0.1', port=5001, debug=False)
