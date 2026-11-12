"""Actual supplied exam: teacher import, authorization, persisted written responses and partial grading."""
import json
from pathlib import Path
import urllib.request
import urllib.error


def check_docx(call, base, teacher):
    docx = Path(__file__).with_name('fixtures').joinpath('unit-1-exam.docx').read_bytes()
    def upload(opener, content=docx, name='exam.docx', origin=True):
        boundary = '---DocxImportFixture'
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n').encode() + content + f'\r\n--{boundary}--\r\n'.encode()
        headers = {'Content-Type': 'multipart/form-data; boundary=' + boundary}
        if origin:
            headers['Origin'] = base
        request = urllib.request.Request(base + '/api/assignments/import-docx', data=body, headers=headers)
        try:
            with opener.open(request) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    guest = urllib.request.build_opener()
    assert upload(guest)[0] == 401
    assert upload(teacher, origin=False)[0] == 403
    assert upload(teacher, b'bad zip')[0] == 400
    assert upload(teacher, name='exam.pdf')[0] == 400
    status, exam = upload(teacher)
    assert status == 200 and len(exam['questions']) == 47, (status, exam)
    _, data = call('/api/manage')
    student = data['students'][0]
    payload = {'action': 'assignment', 'class_id': student['class_id'], 'title': 'DOCX integration', 'instructions': exam['instructions'], 'deadline': '2026-12-25', 'file_id': None, 'questions': exam['questions'], 'notify': False}
    status, data = call('/api/manage', payload)
    assert status == 200, data
    assignment = next(a for a in data['assignments'] if a['title'] == 'DOCX integration')
    portal = '/api/student/' + student['token']
    _, visible = call(portal, opener=guest)
    visible_exam = next(a for a in visible['assignments'] if a['id'] == assignment['id'])
    assert visible_exam['questions'][0]['options'][0] == 'wash<u>ed</u>'
    assert len(visible_exam['questions'][17]['context']) > 1000
    assert all('correctIndex' not in q for q in visible_exam['questions'])
    answer = {'assignment_id': assignment['id'], 'answer': '', 'quiz_answers': {'docx_1': 2}, 'text_answers': {'docx_36': 'fitness', 'docx_47': 'skip breakfast'}}
    assert call(portal, answer, opener=guest)[0] == 200
    _, visible = call(portal, opener=guest)
    saved = next(s for s in visible['submissions'] if s['assignment_id'] == assignment['id'])
    assert saved['text_answers'] == answer['text_answers'] and saved['score'] == ''
    _, teacher_data = call('/api/manage')
    assert next(s for s in teacher_data['submissions'] if s['id'] == saved['id'])['text_answers']['docx_36'] == 'fitness'
    assert call(portal, {**answer, 'text_answers': {'fake_id': 'spoof'}}, opener=guest)[0] == 400
    assert call(portal, {**answer, 'quiz_answers': {'docx_1': 5}}, opener=guest)[0] == 400
    assert call(portal, {**answer, 'quiz_answers': {}, 'text_answers': {'docx_36': '  '}}, opener=guest)[0] == 400
    assert call(portal, {**answer, 'quiz_answers': {}, 'text_answers': {'docx_36': 'fitness only'}}, opener=guest)[0] == 200
    exam['questions'][0]['correctIndex'] = 2
    assert call('/api/manage', {**payload, 'action': 'update_assignment', 'id': assignment['id']})[0] == 200
    assert call(portal, answer, opener=guest)[0] == 200
    _, visible = call(portal, opener=guest)
    score = next(s for s in visible['submissions'] if s['assignment_id'] == assignment['id'])['score']
    assert '1/1' in score and '46' in score, score
    assert call('/api/manage', {'action': 'delete_assignment', 'id': assignment['id']})[0] == 200
    print('PASS: real DOCX 47-question import, permissions, passages/underlines, written submissions, teacher review and partial scoring')
