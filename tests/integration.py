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

with tempfile.TemporaryDirectory(prefix='an-english-test-') as directory:
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    base = f'http://127.0.0.1:{port}'
    password = secrets.token_urlsafe(24)
    env = {**os.environ, 'DATA_DIR': directory, 'ADMIN_PASSWORD': password}
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
            assert 'LỚP HỌC CỦA AN'.encode() in page_html
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
            assert call('/api/logout', {})[0] == 200
            assert call('/api/manage')[0] == 401
            print('PASS: login, CSRF, protected data, seed, attendance, payment, validation, student creation, scheduling, assignment, student submission, feedback, file upload/access isolation and logout')
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
