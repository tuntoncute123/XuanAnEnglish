"""Student account provisioning and password lifecycle on the isolated test server."""
import http.cookiejar
import json
import urllib.error
import urllib.request


def check_student_accounts(call, base):
    status, data = call('/api/manage', {
        'action': 'student', 'name': 'Account lifecycle test', 'parent': '', 'phone': '', 'class_id': 1,
    })
    assert status == 200, (status, data)
    student = next(s for s in data['students'] if s['name'] == 'Account lifecycle test')
    assert student['username'] and not student['has_password']
    account = {'action': 'student_account', 'student_id': student['id'], 'username': 'Đỗ.Ánh'}
    status, error = call('/api/manage', account)
    assert status == 400 and 'chưa có mật khẩu' in json.loads(error)['error']
    status, data = call('/api/manage', {**account, 'password': 'initial-pass-123'})
    saved = next(s for s in data['students'] if s['id'] == student['id'])
    assert status == 200 and saved['username'] == 'do.anh' and saved['has_password']
    assert 'password_hash' not in saved and 'password' not in saved

    def client():
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def patch(opener, old, new, origin=True):
        request = urllib.request.Request(base + '/api/student/me', method='PATCH',
            data=json.dumps({'action': 'change_password', 'current_password': old, 'new_password': new}).encode(),
            headers={'Content-Type': 'application/json', **({'Origin': base} if origin else {})})
        try:
            with opener.open(request) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code

    first, second = client(), client()
    credentials = {'username': 'do.anh', 'password': 'initial-pass-123'}
    assert call('/api/student/login', credentials, opener=first)[0] == 200
    assert call('/api/student/login', credentials, opener=second)[0] == 200
    assert call('/api/manage', opener=first)[0] == 401
    assert patch(first, 'wrong', 'new-pass-456') == 400
    assert patch(first, 'initial-pass-123', 'short') == 400
    assert patch(first, 'initial-pass-123', 'new-pass-456', origin=False) == 403
    assert patch(first, 'initial-pass-123', 'new-pass-456') == 200
    assert call('/api/student/me', opener=first)[0] == 200
    assert call('/api/student/me', opener=second)[0] == 401
    assert call('/api/student/login', credentials, opener=second)[0] == 401
    assert call('/api/student/login', {**credentials, 'password': 'new-pass-456'}, opener=second)[0] == 200
    # Saving just a username keeps an already active password working.
    assert call('/api/manage', {**account, 'username': 'do.anh.renamed'})[0] == 200
    assert call('/api/student/login', {'username': 'do.anh.renamed', 'password': 'new-pass-456'}, opener=client())[0] == 200
    assert call('/api/manage', {**account, 'password': 'teacher-reset-789'})[0] == 200
    assert call('/api/student/me', opener=first)[0] == 401
    assert call('/api/student/me', opener=second)[0] == 401
    assert call('/api/student/login', {**credentials, 'password': 'teacher-reset-789'}, opener=client())[0] == 200
    print('PASS: student activation, normalized credentials, password change, session invalidation and teacher reset')
