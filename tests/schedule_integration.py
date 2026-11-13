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

    # Reported case: change only the class of an unrecorded Sunday lesson with no topic.
    before_ids = {s['id'] for s in snapshot()['sessions']}
    sunday = {**draft, 'date': day(6), 'time': '15:00', 'topic': ''}
    single_data = post({'action': 'session', **sunday})
    single = next(s for s in single_data['sessions'] if s['id'] not in before_ids)
    post({'action': 'update_session', **sunday, 'id': single['id'], 'scope': 'single', 'class_id': 2})
    reloaded = snapshot()
    changed = next(s for s in reloaded['sessions'] if s['id'] == single['id'])
    assert changed == {**single, 'class_id': 2}, (single, changed)
    for class_id in [1, 2]:
        student = next(s for s in reloaded['students'] if s['class_id'] == class_id)
        _, portal = call('/api/student/' + student['token'])
        assert any(s['id'] == single['id'] for s in portal['sessions']) == (class_id == 2)
    post({'action': 'delete_session', 'id': single['id']})

    payload = {'action': 'session', **draft, 'recurrence': {'weekdays': [1, 4], 'until': day(27), 'exclude_dates': [day(3)]}}
    created = post(payload)
    chain = [s for s in created['sessions'] if s['topic'] == draft['topic']]
    assert [s['date'] for s in chain] == [day(i) for i in [0, 7, 10, 14, 17, 21, 24]]
    assert len({s['series_id'] for s in chain}) == 1 and chain[0]['series_id']
    # A fresh page load and the student portal must both include the following week.
    persisted = [s for s in snapshot()['sessions'] if s['series_id'] == chain[0]['series_id']]
    assert persisted == chain
    student = next(s for s in created['students'] if s['class_id'] == draft['class_id'])
    _, portal = call('/api/student/' + student['token'])
    assert any(s['id'] == chain[1]['id'] and s['date'] == day(7) for s in portal['sessions'])
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
    check_recurrence_edits(post, snapshot, day)
    print('PASS: class-only edits with blank topic, next-week persistence, weekly recurrence, holiday exclusions, atomic conflict checks, concurrent writes, series edits, cancellations, protected attendance, and student schedule')


def check_recurrence_edits(post, snapshot, day):
    draft = {'class_id': 1, 'date': day(0), 'time': '07:00', 'duration': 60, 'topic': 'Convert single to weekly'}
    created = post({'action': 'session', **draft})
    anchor = next(s for s in created['sessions'] if s['topic'] == draft['topic'])
    update = {'action': 'update_session', **draft, 'id': anchor['id'], 'scope': 'single', 'class_id': 2,
              'time': '07:30', 'duration': 45, 'topic': 'Edited weekly',
              'recurrence': {'weekdays': [1, 4], 'until': day(27), 'exclude_dates': [day(3)]}}
    converted = post(update)
    chain = [s for s in converted['sessions'] if s['topic'] == update['topic']]
    assert [s['date'] for s in chain] == [day(i) for i in [0, 7, 10, 14, 17, 21, 24]]
    assert chain[0]['id'] == anchor['id']
    series = chain[0]['series_id']
    assert series and all(s['series_id'] == series and s['class_id'] == 2 and s['time'] == '07:30' and s['duration'] == 45 for s in chain)
    assert [s for s in snapshot()['sessions'] if s['series_id'] == series] == chain

    # Convert then edit weekdays, extend the end date and skip a holiday atomically.
    extend = {**update, 'scope': 'following', 'recurrence': {'weekdays': [1, 3], 'until': day(35), 'exclude_dates': [day(9)]}}
    blocker_data = post({'action': 'session', **draft, 'date': day(35), 'topic': 'Conversion blocker'})
    blocker = next(s for s in blocker_data['sessions'] if s['topic'] == 'Conversion blocker')
    before = snapshot()['sessions']
    post(extend, 409)
    assert snapshot()['sessions'] == before
    post({'action': 'delete_session', 'id': blocker['id']})
    extended = post(extend)
    chain = [s for s in extended['sessions'] if s['series_id'] == series]
    assert [s['date'] for s in chain] == [day(i) for i in [0, 2, 7, 14, 16, 21, 23, 28, 30, 35]]
    assert chain[0]['id'] == anchor['id']
    # Repeating a save does not duplicate occurrences or replace retained IDs.
    assert [s for s in post(extend)['sessions'] if s['series_id'] == series] == chain

    cancelled = next(s for s in chain if s['date'] == day(7))
    recorded = next(s for s in chain if s['date'] == day(14))
    post({'action': 'cancel_session', 'id': cancelled['id'], 'reason': 'Keep cancellation'})
    students = [s for s in snapshot()['students'] if s['class_id'] == 2]
    post({'action': 'attendance', 'session_id': recorded['id'], 'records': [
        {'student_id': s['id'], 'status': 'present', 'focus': 4, 'homework': 5, 'note': 'Protected'} for s in students]})
    protected = {s['id']: s for s in snapshot()['sessions'] if s['id'] in [cancelled['id'], recorded['id']]}
    post({**update, 'id': recorded['id']}, 400)
    post({**update, 'id': cancelled['id']}, 400)
    shortened = post({**extend, 'recurrence': {'weekdays': [1], 'until': day(21), 'exclude_dates': []}})
    remaining = [s for s in shortened['sessions'] if s['series_id'] == series]
    assert [s['date'] for s in remaining] == [day(i) for i in [0, 7, 14, 21]]
    assert all(next(s for s in remaining if s['id'] == sid) == before for sid, before in protected.items())

    # Return the editable part of the chain to one lesson without touching protected history.
    collapsed = post({**extend, 'recurrence': None})
    single = next(s for s in collapsed['sessions'] if s['id'] == anchor['id'])
    assert single['series_id'] is None
    assert {s['id'] for s in collapsed['sessions'] if s['series_id'] == series} == set(protected)
    assert all(next(s for s in collapsed['sessions'] if s['id'] == sid) == before for sid, before in protected.items())
    post({'action': 'delete_session', 'id': anchor['id']})

    # A single-scope conversion must not alter or silently absorb the other series slots.
    detached_data = post({'action': 'session', **draft, 'topic': 'Detach', 'repeat_weeks': 2})
    detaching = [s for s in detached_data['sessions'] if s['topic'] == 'Detach']
    post({'action': 'update_session', **draft, 'id': detaching[0]['id'], 'recurrence': None})
    assert next(s for s in snapshot()['sessions'] if s['id'] == detaching[1]['id']) == detaching[1]
    assert next(s for s in snapshot()['sessions'] if s['id'] == detaching[0]['id'])['series_id'] is None
    for s in detaching:
        post({'action': 'delete_session', 'id': s['id']})
    print('PASS: single-to-weekly conversion, all fields, weekday/end/holiday edits, stable IDs, atomic conflicts, protected history and weekly-to-single conversion')
