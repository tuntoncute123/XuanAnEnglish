"""Production HTTP smoke test against an isolated temporary database. Run after npm run build."""
import http.cookiejar
import json
import os
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

database_url = os.environ.get('TEST_DATABASE_URL')
if not database_url or not database_url.split('?', 1)[0].rstrip('/').endswith('_test'):
    raise SystemExit('Set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test')

with tempfile.TemporaryDirectory(prefix='an-english-test-') as directory:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    password = secrets.token_urlsafe(24)
    env = {**os.environ, 'FRONTEND_BACKEND': '1', 'DATA_DIR': directory, 'DATABASE_URL': database_url, 'SEED_DEMO_DATA': 'true', 'ADMIN_PASSWORD': password, 'SESSION_SECRET': secrets.token_hex(48)}
    with tempfile.TemporaryFile() as log:
        proc = subprocess.Popen(['node', 'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', str(port)], env=env, stdout=log, stderr=log)
        client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        def call(path, body=None, origin=True, opener=client):
            headers = {'Origin': base} if origin else {}
            if body is not None:
                headers['Content-Type'] = 'application/json'
            req = urllib.request.Request(base+path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
            try:
                with opener.open(req) as response:
                    raw = response.read()
                    return response.status, json.loads(raw) if 'application/json' in response.headers.get('Content-Type','') else raw
            except urllib.error.HTTPError as error:
                return error.code, error.read()
        try:
            for _ in range(80):
                try:
                    assert call('/')[0] == 200
                    break
                except (urllib.error.URLError, ConnectionError):
                    time.sleep(.25)
            else:
                raise AssertionError('Server did not become ready')
            assert call('/api/manage')[0] == 401
            assert call('/api/login', {'password':password}, origin=False)[0] == 403
            wrong = call('/api/login', {'password':'wrong'})
            assert wrong[0] == 401, wrong
            assert call('/api/login', {'password':password})[0] == 200
            page_status, page_html = call('/')
            assert page_status == 200, (page_status, page_html)
            assert 'Đang mở lớp học'.encode() in page_html
            assert b'Only plain objects' not in page_html
            status, data = call('/api/manage')
            assert status == 200 and len(data['classes']) == 3 and len(data['students']) == 9
            session = data['sessions'][0]
            students = [s for s in data['students'] if s['class_id'] == session['class_id']]
            records = [{'student_id':s['id'],'status':'present','focus':4,'homework':5,'note':'Good work'} for s in students]
            assert call('/api/manage', {'action':'attendance','session_id':session['id'],'records':records})[0] == 200
            assert call('/api/manage', {'action':'attendance','session_id':session['id'],'records':records[:1]})[0] == 400
            assert call('/api/manage', {'action':'payment','student_id':students[0]['id'],'month':session['date'][:7],'amount':150000})[0] == 200
            assert call('/api/manage', {'action':'class','name':'Test','level':'A2','fee':-1})[0] == 400
            assert call('/api/manage', {'action':'student','name':'New student','parent':'Parent','phone':'0123456789','class_id':1})[0] == 200
            assert call('/api/manage', {'action':'session','class_id':1,'date':'2026-12-01','time':'18:00','duration':90,'topic':'Test'})[0] == 200
            assert call('/api/manage', {'action':'assignment','class_id':1,'title':'Test','instructions':'Write hello','deadline':'2026-12-01','file_id':None})[0] == 200
            _, data = call('/api/manage')
            student = next(s for s in data['students'] if s['class_id'] == 1)
            assignment = next(a for a in data['assignments'] if a['title'] == 'Test')
            guest = urllib.request.build_opener()
            portal = '/api/student/'+student['token']
            status, portal_data = call(portal, opener=guest)
            assert status == 200 and 'phone' not in portal_data['student']
            assert call(portal, {'assignment_id':assignment['id'],'answer':'Hello teacher!','file_id':None}, opener=guest)[0] == 200
            assert call('/student/'+student['token'], opener=guest)[0] == 200
            assert call('/api/student/invalid', opener=guest)[0] == 404
            _, data = call('/api/manage')
            sub = next(s for s in data['submissions'] if s['assignment_id'] == assignment['id'])
            assert call('/api/manage', {'action':'feedback','id':sub['id'],'feedback':'Great job!'})[0] == 200
            _, portal_data = call(portal, opener=guest)
            assert portal_data['submissions'][0]['feedback'] == 'Great job!'
            boundary = '----AnEnglishTestBoundary'
            payload = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="answer.txt"\r\nContent-Type: text/plain\r\n\r\nhello teacher\r\n--{boundary}--\r\n').encode()
            upload = urllib.request.Request(base+'/api/files', data=payload, headers={'Origin':base,'Content-Type':'multipart/form-data; boundary='+boundary,'x-student-token':student['token']})
            with guest.open(upload) as response:
                uploaded = json.load(response)
            file_path = '/api/download/'+uploaded['id']
            assert call(file_path, opener=guest)[0] == 403
            assert call(file_path+'?token='+student['token'], opener=guest)[0] == 200
            other = next(s for s in data['students'] if s['id'] != student['id'])
            assert call(file_path+'?token='+other['token'], opener=guest)[0] == 403
            assert call(portal, {'assignment_id':assignment['id'],'answer':'Attached','file_id':uploaded['id']}, opener=guest)[0] == 200
            assert call(file_path)[0] == 200
            assert call('/student', opener=guest)[0] == 200
            assert call('/manifest.webmanifest', opener=guest)[0] == 200
            assert call('/sw.js', opener=guest)[0] == 200
            assert call('/icons/icon-192.png', opener=guest)[0] == 200
            assert call('/api/student/me', opener=guest)[0] == 401
            assert call('/api/manage', {'action':'student_account','student_id':student['id'],'username':'test_student_1','password':'password123'})[0] == 200
            student_client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            assert call('/api/student/login', {'username':'test_student_1','password':'wrong'}, opener=student_client)[0] == 401
            assert call('/api/student/login', {'username':'test_student_1','password':'password123'}, opener=student_client)[0] == 200
            me_status, me_data = call('/api/student/me', opener=student_client)
            assert me_status == 200 and me_data['student']['id'] == student['id'] and 'phone' not in me_data['student']
            assert len(me_data['notifications']) >= 1 and len(me_data['vapidPublicKey']) > 10
            assert call('/api/student/push', {'endpoint':'https://fcm.googleapis.com/fcm/send/demo-endpoint-1','keys':{'p256dh':'BEl62iUYgUivxIkv69yViEuiBIa','auth':'tBHItJI5svbpez7KI4CCXg'},'deviceLabel':'Android'}, opener=student_client)[0] == 200
            assert call('/api/student/me', {'assignment_id':assignment['id'],'answer':'Cross-device answer','file_id':uploaded['id']}, opener=student_client)[0] == 200
            assert call('/api/manage', {'action':'bank','bankId':'VCB','accountNo':'0123456789','accountName':'XUAN AN'})[0] == 200
            assert call('/api/manage', {'action':'assignment','class_id':1,'title':'Quiz 1','instructions':'Choose','deadline':'2026-12-02','file_id':None,'questions':[{'id':'q1','prompt':'Cat?','options':['Cat','Dog'],'correctIndex':0}]})[0] == 200
            _, me_quiz = call('/api/student/me', opener=student_client)
            quiz_item = next(a for a in me_quiz['assignments'] if a['title'] == 'Quiz 1')
            assert 'correctIndex' not in quiz_item['questions'][0] and me_quiz['monthlySummary']['bank']['bankId'] == 'VCB'
            assert call('/api/student/me', {'assignment_id':quiz_item['id'],'answer':'','file_ids':[uploaded['id']],'quiz_answers':{'q1':0}}, opener=student_client)[0] == 200
            _, me_after_quiz = call('/api/student/me', opener=student_client)
            quiz_sub = next(s for s in me_after_quiz['submissions'] if s['assignment_id'] == quiz_item['id'])
            assert '1/1' in quiz_sub['score'] and len(quiz_sub['attachments']) == 1
            assert call('/api/cron/reminders', {})[0] == 200
            assert call('/api/student/logout', {'endpoint':'https://fcm.googleapis.com/fcm/send/demo-endpoint-1'}, opener=student_client)[0] == 200
            assert call('/api/student/me', opener=student_client)[0] == 401
            assert call('/api/logout', {})[0] == 200
            assert call('/api/manage')[0] == 401
            print('PASS: all teacher CRUD, recurring schedule, quiz auto-grading, multi-attachments, VietQR, student accounts, PWA/Web Push, cron reminders, and logout')
        except Exception:
            log.seek(0)
            print(log.read().decode()[-6000:])
            raise
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()
