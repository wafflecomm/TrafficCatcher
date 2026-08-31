import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from contextlib import closing

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import member_auth as auth
from flask import Flask


def bundle(mode='story'):
    cuts = [dict(cut=i+1, time='장면', role='소개', conceptKo='한글 콘셉트', promptEn='A scene with "quotes" <b>literal</b>') for i in range(4)]
    return dict(version=1, article_mode=mode, keyword='저장 주제', illustration_storyboard=cuts,
                shorts_storyboard=cuts, story_input=dict(title='내 제목', content='내 메모', request='따뜻하게', type='뉴스형'))


class DraftApiTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.dbfile = str(Path(self.temp.name) / 'test.db')
        self.user = dict(id='owner', role='member', plan_code='free')
        self.patches = [patch.object(auth, 'AUTH_DB_FILE', self.dbfile),
                        patch.object(auth, '_current_session', side_effect=lambda: self.user),
                        patch.object(auth, '_has_feature', return_value=True)]
        for item in self.patches:
            item.start()
        schema = Path(auth.AUTH_SCHEMA_FILE).read_text(encoding='utf-8').replace("    bundle_json TEXT NOT NULL DEFAULT '{}',\n", '')
        with closing(sqlite3.connect(self.dbfile)) as db, db:
            db.executescript(schema)
            db.execute("INSERT INTO users (id,email,nickname,created_at,updated_at) VALUES ('owner','owner@example.test','테스트','2026-01-01','2026-01-01')")
            db.execute("INSERT INTO user_drafts (id,user_id,title,body_markdown,created_at,updated_at) VALUES ('legacy','owner','예전 글',?,'2026-01-01','2026-01-01')", ('이전 본문 ' * 10,))
        app = Flask(__name__)
        app.register_blueprint(auth.auth_blueprint, url_prefix='/api/auth')
        app.config['TESTING'] = True
        self.client = app.test_client()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def save(self, **overrides):
        payload = dict(title='저장 글', body_markdown='# 제목\n' + '본문입니다. ' * 12, bundle=bundle())
        payload.update(overrides)
        return self.client.post('/api/auth/drafts', json=payload)

    def test_old_schema_migrates_and_legacy_remains_empty(self):
        result = self.client.get('/api/auth/drafts/legacy').get_json()['draft']
        self.assertEqual(result['bundle']['version'], 0)
        self.assertEqual(result['illustration_count'], 0)
        with closing(sqlite3.connect(self.dbfile)) as db:
            self.assertIn('bundle_json', [row[1] for row in db.execute('PRAGMA table_info(user_drafts)')])

    def test_roundtrip_both_modes_and_summary(self):
        for mode in ['story', 'keyword']:
            saved = self.save(title=mode, bundle=bundle(mode))
            self.assertEqual(saved.status_code, 200)
            draft_id = saved.get_json()['draft']['id']
            detail = self.client.get('/api/auth/drafts/' + draft_id).get_json()['draft']
            self.assertEqual(detail['bundle']['article_mode'], mode)
            self.assertEqual(detail['bundle']['shorts_storyboard'], bundle(mode)['shorts_storyboard'])
            self.assertEqual(detail['bundle']['illustration_storyboard'], bundle(mode)['illustration_storyboard'])
        rows = self.client.get('/api/auth/drafts').get_json()['drafts']
        self.assertTrue(all(row['illustration_count'] == 4 and row['shorts_count'] == 4 for row in rows if row['id'] != 'legacy'))
        self.assertTrue(all('bundle' not in row for row in rows))

    def test_rename_updates_same_record_and_preserves_bundle_for_old_client(self):
        draft_id = self.save().get_json()['draft']['id']
        self.assertEqual(self.save(draft_id=draft_id, title='제목 수정').get_json()['count'], 2)
        result = self.client.post('/api/auth/drafts', json=dict(draft_id=draft_id, title='제목 수정', body_markdown='수정 본문 ' * 15))
        self.assertEqual(result.status_code, 200)
        detail = self.client.get('/api/auth/drafts/' + draft_id).get_json()['draft']
        self.assertEqual(detail['shorts_count'], 4)

    def test_other_user_cannot_read_update_delete(self):
        draft_id = self.save().get_json()['draft']['id']
        self.user = dict(id='other', role='member', plan_code='free')
        self.assertEqual(self.client.get('/api/auth/drafts/' + draft_id).status_code, 404)
        self.assertEqual(self.save(draft_id=draft_id).status_code, 404)
        self.assertEqual(self.client.delete('/api/auth/drafts/' + draft_id).status_code, 404)

    def test_auth_and_permission_required(self):
        self.user = None
        self.assertEqual(self.save().status_code, 401)
        self.user = dict(id='owner', role='member', plan_code='free')
        with patch.object(auth, '_has_feature', return_value=False):
            self.assertEqual(self.save().status_code, 403)

    def test_invalid_bundle_rejected(self):
        for invalid in [None, [], {}, dict(bundle(), shorts_storyboard=[{}] * 5), dict(bundle(), keyword='x' * 501)]:
            self.assertEqual(self.save(bundle=invalid).status_code, 400)

    def test_empty_boards_explicitly_clear(self):
        draft_id = self.save().get_json()['draft']['id']
        empty = dict(bundle(), illustration_storyboard=[], shorts_storyboard=[])
        self.assertEqual(self.save(draft_id=draft_id, bundle=empty).status_code, 200)
        detail = self.client.get('/api/auth/drafts/' + draft_id).get_json()['draft']
        self.assertEqual(detail['shorts_count'], 0)


if __name__ == '__main__':
    unittest.main()
