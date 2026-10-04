"""Integra os testes do filtro de auditoria ao comando já usado pelo CI."""
from pathlib import Path
import subprocess
import unittest

class AuditTests(unittest.TestCase):
    def test_audit_policy(self):
        path = Path(__file__).with_name('audit-dependencies.test.mjs')
        result = subprocess.run(['node', '--test', str(path)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
