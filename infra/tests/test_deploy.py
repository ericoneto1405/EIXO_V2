"""Exercita seleção e executor em Git descartável com serviços simulados.

Nenhum SSH, npm real, banco, PM2 ou acesso à produção.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1]


class DeployTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        self.calls = self.root / 'calls'
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.env = dict(os.environ, PATH=f'{self.bin}:{os.environ["PATH"]}',
                        CALLS=str(self.calls), FAIL_MATCH='')
        for cmd in ['npm', 'npx', 'pm2', 'curl', 'node', 'flock']:
            path = self.bin / cmd
            path.write_text('''#!/usr/bin/env bash
echo "$(basename "$0") $*" >> "$CALLS"
if [ -n "$FAIL_MATCH" ] && [[ "$(basename "$0") $*" == *"$FAIL_MATCH"* ]]; then exit 19; fi
''')
            path.chmod(0o755)
        self.git('init', '-q')
        self.git('config', 'user.email', 'deploy-test@example.invalid')
        self.git('config', 'user.name', 'Deploy test')
        self.write('.gitignore', 'node_modules/\nfrontend/dist/\nserver/.env.production\n')
        self.write('infra/deploy-plan.sh', (SOURCE / 'deploy-plan.sh').read_text())
        self.write('infra/deploy-validate.sh', (SOURCE / 'deploy-validate.sh').read_text())
        # A cópia de teste substitui SOMENTE a trava de localização da VPS.
        script = (SOURCE / 'deploy.sh').read_text().replace(
            '[ "$PWD" = /var/www/eixo ]', f'[ "$PWD" = "{self.repo}" ]')
        self.executor = self.root / 'executor.sh'
        self.executor.write_text(script)
        self.write('server/backup.sh', 'echo backup >> "$CALLS"\n[ "$FAIL_MATCH" != backup ]\n')
        self.write('server/index.js', '// fixture\n')
        self.write('frontend/App.tsx', '// fixture\n')
        self.write('package-lock.json', '{}\n')
        self.write('server/prisma/migrations/001/migration.sql', 'SELECT 1;\n')
        self.write('server/.env.production', 'DATABASE_URL=postgresql://test/isolated\n')
        self.write('frontend/dist/index.html', 'fixture')
        (self.repo / 'node_modules').mkdir()
        self.initial = self.commit()

    def write(self, path, content):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.repo, text=True,
                                       stderr=subprocess.DEVNULL).strip()

    def commit(self):
        self.git('add', '.')
        self.git('commit', '-qm', 'fixture')
        sha = self.git('rev-parse', 'HEAD')
        self.git('update-ref', 'refs/remotes/origin/main', sha)
        return sha

    def seed_success(self):
        state = self.repo / '.git/eixo-deploy'
        state.mkdir(exist_ok=True)
        (state / 'success').write_text(f'{self.initial} {self.initial}\n')
        (state / 'environment').write_text(self.git('hash-object', 'server/.env.production') + '\n')

    def deploy(self, target, fail='', ok=True):
        # Representa a VPS ainda na versão anterior, antes da atualização.
        self.git('checkout', '-q', '--detach', self.initial)
        self.calls.write_text('')
        result = subprocess.run(['bash', str(self.executor), target], cwd=self.repo,
                                env=dict(self.env, FAIL_MATCH=fail),
                                text=True, capture_output=True)
        if ok:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return self.calls.read_text(), result

    def test_first_deploy_and_same_sha(self):
        calls, _ = self.deploy(self.initial)
        for item in ['backup', 'npm ci', 'migrate deploy', 'npm run build', 'pm2 start']:
            self.assertIn(item, calls)
        calls, _ = self.deploy(self.initial)
        for item in ['backup', 'npm ci', 'migrate deploy', 'npm run build', 'pm2 start']:
            self.assertNotIn(item, calls)
        self.assertIn('curl', calls)

    def test_docs_skip_runtime(self):
        self.seed_success()
        self.write('README.md', 'docs')
        target = self.commit()
        calls, _ = self.deploy(target)
        for item in ['backup', 'npm ci', 'migrate deploy', 'npm run build', 'pm2 start']:
            self.assertNotIn(item, calls)
        self.assertEqual((self.repo / '.git/eixo-deploy/success').read_text().strip(),
                         f'{target} {self.initial}')

    def test_backend_preserves_frontend_and_dependencies(self):
        self.seed_success()
        self.write('server/index.js', '// changed')
        calls, _ = self.deploy(self.commit())
        self.assertIn('backup', calls)
        self.assertIn('pm2 start', calls)
        for item in ['npm ci', 'npm run build', 'migrate deploy']:
            self.assertNotIn(item, calls)

    def test_frontend_builds_and_updates_release(self):
        self.seed_success()
        self.write('frontend/App.tsx', '// changed')
        calls, _ = self.deploy(self.commit())
        self.assertIn('npm run build', calls)
        self.assertIn('pm2 start', calls)
        self.assertNotIn('npm ci', calls)
        self.assertNotIn('migrate deploy', calls)

    def test_dependencies_install_without_migrations(self):
        self.seed_success()
        self.write('package-lock.json', '{"changed":true}')
        calls, _ = self.deploy(self.commit())
        self.assertIn('npm ci', calls)
        self.assertIn('npm run build', calls)
        self.assertNotIn('migrate deploy', calls)

    def test_new_migration(self):
        self.seed_success()
        self.write('server/prisma/migrations/002/migration.sql', 'SELECT 2;')
        calls, _ = self.deploy(self.commit())
        self.assertIn('migrate deploy', calls)
        self.assertLess(calls.index('backup'), calls.index('migrate deploy'))

    def test_old_migration_change_blocked(self):
        self.seed_success()
        self.write('server/prisma/migrations/001/migration.sql', 'SELECT 2;')
        calls, _ = self.deploy(self.commit(), ok=False)
        self.assertNotIn('migrate deploy', calls)

    def test_failure_stops_and_blocks_retry(self):
        calls, result = self.deploy(self.initial, fail='backup', ok=False)
        self.assertIn('backup', result.stderr)
        self.assertNotIn('npm ci', calls)
        self.assertFalse((self.repo / '.git/eixo-deploy/success').exists())
        calls, _ = self.deploy(self.initial, ok=False)
        self.assertNotIn('backup', calls)

    def test_health_failure_does_not_mark_success(self):
        calls, result = self.deploy(self.initial, fail='curl', ok=False)
        self.assertIn('health-api', result.stderr)
        self.assertFalse((self.repo / '.git/eixo-deploy/success').exists())
        self.assertTrue((self.repo / '.git/eixo-deploy/in-progress').exists())

    def test_build_failure_does_not_restart(self):
        calls, result = self.deploy(self.initial, fail='npm run build', ok=False)
        self.assertIn('build', result.stderr)
        self.assertNotIn('pm2 delete', calls)
        self.assertNotIn('pm2 start', calls)
        self.assertFalse((self.repo / '.git/eixo-deploy/success').exists())

    def test_version_failure_does_not_mark_success(self):
        calls, result = self.deploy(self.initial, fail='support:verify-release', ok=False)
        self.assertIn('versao', result.stderr)
        self.assertFalse((self.repo / '.git/eixo-deploy/success').exists())

    def test_missing_dependencies_are_reinstalled(self):
        self.seed_success()
        (self.repo / 'node_modules').rmdir()
        calls, _ = self.deploy(self.initial)
        self.assertIn('npm ci', calls)
        self.assertIn('npm run generate', calls)

    def test_sha_outside_main_is_rejected(self):
        self.write('server/index.js', '// branch only')
        target = self.commit()
        self.git('update-ref', 'refs/remotes/origin/main', self.initial)
        calls, result = self.deploy(target, ok=False)
        self.assertIn('origin/main', result.stdout)
        self.assertNotIn('backup', calls)

    def test_removed_migration_is_rejected(self):
        self.seed_success()
        (self.repo / 'server/prisma/migrations/001/migration.sql').unlink()
        calls, result = self.deploy(self.commit(), ok=False)
        self.assertIn('alterada/removida', result.stdout)
        self.assertNotIn('migrate deploy', calls)

    def test_dirty_checkout_is_preserved(self):
        self.write('server/index.js', 'local work')
        _, _ = self.deploy(self.initial, ok=False)
        self.assertEqual((self.repo / 'server/index.js').read_text(), 'local work')

    def test_unknown_path_is_conservative(self):
        self.seed_success()
        self.write('new-config.json', '{}')
        calls, _ = self.deploy(self.commit())
        self.assertIn('npm ci', calls)
        self.assertIn('npm run build', calls)
        self.assertNotIn('migrate deploy', calls)

    def test_missing_build_is_recovered(self):
        self.seed_success()
        (self.repo / 'frontend/dist/index.html').unlink()
        calls, _ = self.deploy(self.initial)
        self.assertIn('npm run build', calls)

    def test_lock_failure_stops_before_changes(self):
        calls, _ = self.deploy(self.initial, fail='flock', ok=False)
        self.assertNotIn('backup', calls)
        self.assertFalse((self.repo / '.git/eixo-deploy/in-progress').exists())

    def test_environment_change_rebuilds_and_restarts(self):
        self.seed_success()
        self.write('server/.env.production', 'DATABASE_URL=postgresql://test/isolated\nNEW_OPTION=yes\n')
        calls, _ = self.deploy(self.initial)
        self.assertIn('npm run build', calls)
        self.assertIn('pm2 start', calls)
        self.assertNotIn('npm ci', calls)

    def test_accumulates_unpublished_commits(self):
        self.seed_success()
        self.write('frontend/App.tsx', '// unpublished')
        self.commit()
        self.write('server/index.js', '// newer')
        calls, _ = self.deploy(self.commit())
        self.assertIn('npm run build', calls)
        self.assertIn('pm2 start', calls)

    def test_validator_docs_does_not_call_npm(self):
        self.write('README.md', 'docs')
        self.commit()
        self.calls.write_text('')
        result = subprocess.run(['bash', 'infra/deploy-validate.sh', self.initial],
                                cwd=self.repo, env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls.read_text(), '')

    def test_validator_backend_and_failure(self):
        self.write('server/index.js', '// changed')
        self.commit()
        self.calls.write_text('')
        result = subprocess.run(['bash', 'infra/deploy-validate.sh', self.initial],
                                cwd=self.repo, env=dict(self.env, FAIL_MATCH='npm test'),
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 19)
        self.assertIn('testes-backend', result.stderr)
        calls = self.calls.read_text()
        self.assertIn('prisma validate', calls)
        self.assertNotIn('npm run build', calls)
        self.assertNotIn('support:validate', calls)


if __name__ == '__main__':
    unittest.main()
