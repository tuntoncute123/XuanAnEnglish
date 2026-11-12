"""Schedule HTTP regression checks, called by integration.py on its isolated database."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone


def check_schedules(call):
    def snapshot():
        status, body = call('/api/manage')
        assert status == 200
        return body

    def post(body, expected=200):
        result = call('/api/manage', body)
        assert result[0] == expected, (body, result)
        return result[1]

    today = datetime.now(timezone(timedelta(hours=7))).date()
    start = today + timedelta(days=14)
    start += timedelta(days=(-start.weekday()) % 7)
    day = lambda offset: (start + timedelta(days=offset)).isoformat()
    draft = {'class_id': 1, 'date': day(0), 'time': '09:00', 'duration': 90, 'topic': 'Schedule integration'}
    payload = {'action': 'session', **draft, 'recurrence': {'weekdays': [1, 4], 'until': day(27), 'exclude_dates': [day(3)]}}
    created = post(payload)
    chain = [s for s in created['sessions'] if s['topic'] == draft['topic']]
    assert [s['date'] for s in chain] == [day(i) for i in [0, 7, 10, 14, 17, 21, 24]]
    assert len({s['series_id'] for s in chain}) == 1 and chain[0]['series_id']
    original_ids = {s['id'] for s in chain}
    anchor = chain[0]

    # Teacher-wide collisions, adjacency, and no partial writes.
    baseline = len(created['sessions'])
    post({'action': 'session', **draft, 'class_id': 2, 'time': '09:30'}, 409)
    assert len(snapshot()['sessions']) == baseline
    adjacent = post({'action': 'session', **draft, 'class_id': 2, 'time': '10:30', 'topic': 'Adjacent'})
    adjacent_id = next(s['id'] for s in adjacent['sessions'] if s['topic'] == 'Adjacent')
    post({'action': 'delete_session', 'id': adjacent_id})
    for invalid in [
        {**payload, 'recurrence': {**payload['recurrence'], 'until': day(-1)}},
        {'action': 'session', **draft, 'time': '23:30'},
        {**payload, 'recurrence': {'weekdays': [], 'until': day(27)}},
    ]:
        post(invalid, 400)

    blocker_data = post({'action': 'session', **draft, 'date': day(56), 'class_id': 2, 'topic': 'Blocker'})
    blocker = next(s for s in blocker_data['sessions'] if s['topic'] == 'Blocker')
    count = len(blocker_data['sessions'])
    post({'action': 'session', **draft, 'date': day(49), 'repeat_weeks': 3, 'topic': 'Atomic batch'}, 409)
    assert len(snapshot()['sessions']) == count
    assert not any(s['topic'] == 'Atomic batch' for s in snapshot()['sessions'])
    post({'action': 'delete_session', 'id': blocker['id']})

    # Two simultaneous requests for the same slot cannot both commit.
    race = {'action': 'session', **draft, 'date': day(70), 'topic': 'Concurrent slot'}
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: call('/api/manage', race)[0], range(2)))
    assert sorted(results) == [200, 409], results
    concurrent = [s for s in snapshot()['sessions'] if s['topic'] == 'Concurrent slot']
    assert len(concurrent) == 1
    post({'action': 'delete_session', 'id': concurrent[0]['id']})

    # Cancellation keeps history, rejects attendance, and frees the time slot.
    cancelled_id = chain[2]['id']
    cancelled_data = post({'action': 'cancel_session', 'id': cancelled_id, 'reason': 'Nghỉ lễ'})
    cancelled = next(s for s in cancelled_data['sessions'] if s['id'] == cancelled_id)
    assert cancelled['status'] == 'cancelled' and cancelled['cancellation_reason'] == 'Nghỉ lễ'
    post({'action': 'attendance', 'session_id': cancelled_id, 'records': []}, 400)
    filled = post({'action': 'session', **draft, 'date': cancelled['date'], 'class_id': 2, 'topic': 'Replacement'})
    replacement = next(s for s in filled['sessions'] if s['topic'] == 'Replacement')
    post({'action': 'restore_session', 'id': cancelled_id}, 409)
    post({'action': 'delete_session', 'id': replacement['id']})
    restored = post({'action': 'restore_session', 'id': cancelled_id})
    assert next(s for s in restored['sessions'] if s['id'] == cancelled_id)['status'] == 'scheduled'
    post({'action': 'cancel_session', 'id': cancelled_id, 'reason': 'Nghỉ lễ'})

    # Recorded sessions remain fixed; other future occurrences can move as a group.
    recorded_id = chain[1]['id']
    students = [s for s in snapshot()['students'] if s['class_id'] == 1]
    records = [{'student_id': s['id'], 'status': 'present', 'focus': 4, 'homework': 5, 'note': 'Keep this record'} for s in students]
    post({'action': 'attendance', 'session_id': recorded_id, 'records': records})
    for action in [
        {'action': 'delete_session', 'id': recorded_id},
        {'action': 'cancel_session', 'id': recorded_id, 'reason': 'Cannot cancel recorded'},
        {'action': 'update_session', **draft, 'id': recorded_id, 'class_id': 2},
    ]:
        post(action, 400)
    assert len([r for r in snapshot()['attendance'] if r['session_id'] == recorded_id]) == len(records)

    blocked = post({'action': 'session', **draft, 'date': day(14), 'time': '10:30', 'class_id': 2, 'topic': 'Bulk blocker'})
    bulk_blocker = next(s for s in blocked['sessions'] if s['topic'] == 'Bulk blocker')
    post({'action': 'update_session', **draft, 'id': anchor['id'], 'scope': 'following', 'time': '10:30'}, 409)
    assert all(s['time'] == '09:00' for s in snapshot()['sessions'] if s['id'] in original_ids)
    post({'action': 'delete_session', 'id': bulk_blocker['id']})
    moved = post({'action': 'update_session', **draft, 'id': anchor['id'], 'scope': 'following', 'date': day(1), 'time': '10:30'})
    for before in chain:
        after = next(s for s in moved['sessions'] if s['id'] == before['id'])
        if before['id'] in [recorded_id, cancelled_id]:
            assert after['date'] == before['date'] and after['time'] == before['time']
        else:
            assert after['date'] == (datetime.fromisoformat(before['date']).date() + timedelta(days=1)).isoformat()
            assert after['time'] == '10:30'

    # Student portal shows the nearest upcoming lessons first, including cancellation reasons.
    _, portal = call('/api/student/' + students[0]['token'])
    future = [s for s in portal['sessions'] if s['date'] >= today.isoformat()]
    assert [(s['date'], s['time']) for s in future] == sorted((s['date'], s['time']) for s in future)
    assert next(s for s in portal['sessions'] if s['id'] == cancelled_id)['cancellation_reason'] == 'Nghỉ lễ'

    # Batch cancel and delete leave recorded/cancelled lessons untouched.
    cancelled_bulk = post({'action': 'cancel_session', 'id': anchor['id'], 'scope': 'following', 'reason': 'Nghỉ cuối kỳ'})
    active_ids = original_ids - {recorded_id, cancelled_id}
    assert all(s['status'] == 'cancelled' for s in cancelled_bulk['sessions'] if s['id'] in active_ids)
    for sid in active_ids:
        post({'action': 'restore_session', 'id': sid})
    removed = post({'action': 'delete_session', 'id': anchor['id'], 'scope': 'following'})
    remaining = {s['id'] for s in removed['sessions']} & original_ids
    assert remaining == {recorded_id, cancelled_id}, remaining
    post({'action': 'delete_session', 'id': cancelled_id})
    post({'action': 'restore_session', 'id': cancelled_id}, 404)
    print('PASS: weekly recurrence, holiday exclusions, atomic conflict checks, concurrent writes, series edits, cancellations, protected attendance, and student schedule')
