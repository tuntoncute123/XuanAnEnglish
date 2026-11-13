"""Check management CRUD and HTTP error classification on the isolated test DB."""
import json


def check_management(call):
    def post(body, expected=200):
        status, data = call('/api/manage', body)
        assert status == expected, (body.get('action'), status, data)
        return json.loads(data) if isinstance(data, bytes) else data

    data = post({'action': 'class', 'name': 'CRUD audit', 'level': 'A1', 'fee': 100000})
    cls = next(c for c in data['classes'] if c['name'] == 'CRUD audit')
    data = post({'action': 'update_class', 'id': cls['id'], 'name': 'CRUD updated', 'level': 'A2', 'fee': 120000})
    assert next(c for c in data['classes'] if c['id'] == cls['id'])['fee'] == 120000
    data = post({'action': 'student', 'name': 'CRUD student', 'parent': '', 'phone': '', 'class_id': cls['id']})
    student = next(s for s in data['students'] if s['class_id'] == cls['id'])
    data = post({'action': 'update_student', 'id': student['id'], 'name': 'CRUD renamed', 'parent': 'Parent', 'phone': '', 'class_id': cls['id']})
    assert next(s for s in data['students'] if s['id'] == student['id'])['name'] == 'CRUD renamed'
    assert 'học viên' in post({'action': 'delete_class', 'id': cls['id']}, 400)['error']

    assignment = {'action': 'assignment', 'class_id': cls['id'], 'title': 'CRUD assignment', 'instructions': 'Test', 'deadline': '2099-01-01', 'file_id': None, 'notify': False}
    invalid_file = post({**assignment, 'file_id': 'missing-test-file'}, 400)
    assert invalid_file['code'] == 'INVALID_OPERATION' and 'Tài liệu' in invalid_file['error']
    data = post(assignment)
    item = next(a for a in data['assignments'] if a['class_id'] == cls['id'])
    data = post({**assignment, 'action': 'update_assignment', 'id': item['id'], 'title': 'CRUD edited'})
    assert next(a for a in data['assignments'] if a['id'] == item['id'])['title'] == 'CRUD edited'
    data = post({'action': 'delete_assignment', 'id': item['id']})
    assert not any(a['id'] == item['id'] for a in data['assignments'])

    data = post({'action': 'session', 'class_id': cls['id'], 'date': '2099-01-01', 'time': '07:00', 'duration': 60, 'topic': ''})
    session = next(s for s in data['sessions'] if s['class_id'] == cls['id'])
    error = post({'action': 'attendance', 'session_id': session['id'], 'records': []}, 400)
    assert error['code'] == 'INVALID_OPERATION' and 'Danh sách' in error['error']
    data = post({'action': 'delete_session', 'id': session['id'], 'scope': 'single'})
    assert not any(s['id'] == session['id'] for s in data['sessions'])
    data = post({'action': 'templates', 'templates': ['Con học tốt.', 'Con cần ôn thêm.']})
    data = post({'action': 'delete_student', 'id': student['id']})
    assert not any(s['id'] == student['id'] for s in data['students'])
    data = post({'action': 'delete_class', 'id': cls['id']})
    assert not any(c['id'] == cls['id'] for c in data['classes'])

    # Stale IDs trigger a database conflict, not a misleading validation error.
    conflict = post({'action': 'payment', 'student_id': student['id'], 'month': '2099-01', 'amount': 1000}, 409)
    assert conflict['code'] == 'RELATED_DATA'
    assert 'payments' not in conflict['error']
    print('PASS: class/student/assignment CRUD, single lesson deletion, templates, actionable attendance/file errors and stale-data conflicts')
