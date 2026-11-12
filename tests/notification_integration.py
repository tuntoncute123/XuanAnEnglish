"""Exercise reminders only on the isolated integration database, with synthetic students."""
import json


def check_notifications(call):
    def post(payload, expected=200):
        status, data = call('/api/manage', payload)
        assert status == expected, (payload.get('action'), status, data)
        return json.loads(data) if isinstance(data, bytes) else data

    data = post({'action': 'assignment', 'class_id': 1, 'title': 'Ôn GK1', 'instructions': 'Bài thử nhắc hạn',
                 'deadline': '2026-11-11', 'file_id': None, 'notify': False})
    assignment = next(a for a in data['assignments'] if a['title'] == 'Ôn GK1')
    students = data['students']
    classmates = [s for s in students if s['class_id'] == 1]
    assert len(classmates) >= 2
    submitted = classmates[0]

    def submit(student):
        result = call('/api/student/' + student['token'], {'assignment_id': assignment['id'], 'answer': 'My answer', 'file_id': None})
        assert result[0] == 200, result

    def notification_ids():
        output = {}
        for student in students:
            status, portal = call('/api/student/' + student['token'])
            assert status == 200
            output[student['id']] = {n['id'] for n in portal['notifications']}
        return output

    submit(submitted)
    before = notification_ids()
    payload = {'action': 'notify', 'assignment_id': assignment['id'], 'title': 'Nhắc làm bài: Ôn GK1',
               'body': 'Hạn nộp 11/11/2026 · Con nhớ hoàn thành và nộp bài cho cô An nhé!'}
    result = post(payload)
    pending_ids = {s['id'] for s in classmates if s['id'] != submitted['id']}
    assert result['notify_summary']['notifiedStudents'] == len(pending_ids)
    after = notification_ids()
    for student in students:
        assert len(after[student['id']] - before[student['id']]) == (1 if student['id'] in pending_ids else 0)
    _, pending_portal = call('/api/student/' + classmates[1]['token'])
    notice = next(n for n in pending_portal['notifications'] if n['id'] not in before[classmates[1]['id']])
    assert notice['type'] == 'reminder'
    assert notice['title'] == payload['title'] and notice['body'] == payload['body']
    assert notice['url'] == '/student?tab=homework&assignment=' + str(assignment['id'])

    # Invalid requests and fully submitted assignments cannot widen the recipient group.
    invalid = post({**payload, 'assignment_id': str(assignment['id'])}, 400)
    assert invalid['code'] == 'INVALID_INPUT'
    assert invalid['issues'][0]['field'] == 'assignment_id'
    unknown = post({**payload, 'action': 'unknown_notify'}, 400)
    assert unknown['code'] == 'UNSUPPORTED_ACTION'
    post({**payload, 'assignment_id': 2147483647}, 404)
    for student in classmates[1:]:
        submit(student)
    complete = post(payload, 400)
    assert 'Tất cả học viên' in complete['error']
    assert notification_ids() == after
    print('PASS: reported reminder payload, correct pending recipients, overdue assignments, version/field errors, and no unintended notifications')
