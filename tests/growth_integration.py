"""Learning, family isolation, immutable recordings, and last-seat concurrency."""
import concurrent.futures
import datetime
import http.cookiejar
import io
import json
import urllib.request
import wave


def check_growth(call, base, admin):
    guest = urllib.request.build_opener()
    def ok(path, body=None, opener=admin):
        status, result = call(path, body, opener=opener)
        assert status == 200, (path, status, result)
        return result
    def manage(body):
        return ok('/api/manage', body)
    def feature(body):
        return ok('/api/learning/admin', body)
    assert call('/api/learning/admin', opener=guest)[0] == 401
    assert call('/api/learning/student', opener=guest)[0] == 401
    assert call('/api/parent', opener=guest)[0] == 401
    assert call('/api/parent', {'action':'logout'}, origin=False, opener=guest)[0] == 403
    for name in ['Growth A', 'Growth B']:
        manage({'action':'class','name':name,'level':'Growth-test-level','fee':100})
    data = ok('/api/manage')
    class_a = next(c['id'] for c in data['classes'] if c['name'] == 'Growth A')
    class_b = next(c['id'] for c in data['classes'] if c['name'] == 'Growth B')
    for i, cid in enumerate([class_a,class_a,class_b]):
        manage({'action':'student','name':f'Growth child {i}','parent':'Parent','phone':'','class_id':cid,'username':f'growth_child_{i}','password':'password123'})
    students = [s for s in ok('/api/manage')['students'] if s['name'].startswith('Growth child')]
    s1,s2,other = students
    clients=[]
    for s in students:
        client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        ok('/api/student/login',{'username':s['username'],'password':'password123'},opener=client)
        clients.append(client)
    c1,c2,cother=clients
    assert call('/api/learning/admin', {'action':'vocab_delete','id':1}, opener=c1)[0] == 401
    today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).date()
    questions=[{'id':'growth-q1','prompt':'She ___ a book.','options':['reads','read','reading'],'correctIndex':0,'topic':'Present simple','unit':'Unit 1','difficulty':'easy','explanation':'She takes reads.'}]
    ids=[]
    for i in range(3):
        data=manage({'action':'assignment','class_id':class_a,'title':f'Growth exam {i}','instructions':'Choose','deadline':str(today),'file_id':None,'questions':questions,'notify':False})
        aid=next(a['id'] for a in data['assignments'] if a['title']==f'Growth exam {i}')
        ids.append(aid)
        portal=ok('/api/student/me',opener=c1)
        hidden=next(a for a in portal['assignments'] if a['id']==aid)['questions'][0]
        assert 'correctIndex' not in hidden and 'explanation' not in hidden
        ok('/api/student/me',{'assignment_id':aid,'answer':'','quiz_answers':{'growth-q1':1}},opener=c1)
    data=ok('/api/learning/student',opener=c1)
    assert len(data['mistakes'])==3 and data['missions'][0]['completed']
    assert call('/api/learning/student',{'action':'claim_reward','badge':'vocab'},opener=c1)[0]==400
    ok('/api/learning/student',{'action':'claim_reward','badge':'submit'},opener=c1)
    ok('/api/learning/student',{'action':'claim_reward','badge':'submit'},opener=c1)
    ok('/api/learning/student',{'action':'avatar','avatar':'🦊'},opener=c1)
    assert len(ok('/api/learning/student',opener=c1)['rewards'])==1
    assert call('/api/learning/student',{'action':'avatar','avatar':'🦉'},opener=c1)[0]==400
    sub=next(s for s in ok('/api/manage')['submissions'] if s['student_id']==s1['id'] and s['assignment_id']==ids[0])
    manage({'action':'feedback','id':sub['id'],'feedback':'Please revise','status':'needs_revision','notify':False})
    ok('/api/student/me',{'assignment_id':ids[0],'answer':'Fixed','quiz_answers':{'growth-q1':0}},opener=c1)
    notebook=ok('/api/learning/student',opener=c1)
    assert len(notebook['mistakes'])==3 and notebook['missions'][1]['completed']
    mistake=notebook['mistakes'][0]
    ok('/api/learning/student',{'action':'review_mistake','key':mistake['key'],'choice':0},opener=c1)
    assert call('/api/learning/student',{'action':'review_mistake','key':mistake['key'],'choice':0},opener=c2)[0]==400
    assert any(m['mastered'] for m in ok('/api/learning/student',opener=c1)['mistakes'])
    feature({'action':'bank_import','assignment_id':ids[0]})
    feature({'action':'bank_import','assignment_id':ids[0]})
    bank=ok('/api/learning/admin')['bank']
    assert len(bank)==1
    question={**bank[0]['question'],'explanation':'Teacher explanation saved'}
    feature({'action':'bank_update','id':bank[0]['id'],'question':question})
    assert any(m['question']['explanation']=='Teacher explanation saved' for m in ok('/api/learning/student',opener=c1)['mistakes'])
    exam={'action':'generate_exam','class_id':class_a,'title':'Generated','deadline':str(today),'unit':'Unit 1','topic':'Present simple','difficulty':'easy','kind':'choice','count':1,'variants':2}
    feature(exam)
    generated=[a for a in ok('/api/manage')['assignments'] if a['title'].startswith('Generated')]
    assert len(generated)==2
    for a in generated:
        q=a['questions'][0]
        assert q['options'][q['correctIndex']]=='reads'
    assert generated[0]['questions'][0]['id']!=generated[1]['questions'][0]['id']
    assert call('/api/learning/admin',{**exam,'count':2})[0]==400
    feature({'action':'remedial','class_id':class_a,'topic':'Present simple','student_ids':[s1['id']]})
    practice=ok('/api/learning/student',opener=c1)['practice'][0]
    assert 'correctIndex' not in practice['questions'][0]
    assert not ok('/api/learning/student',opener=c2)['practice']
    assert call('/api/learning/student',{'action':'practice','id':practice['id'],'answers':{}},opener=c2)[0]==404
    ok('/api/learning/student',{'action':'practice','id':practice['id'],'answers':{practice['questions'][0]['id']:0}},opener=c1)
    feature({'action':'vocab_save','class_id':class_a,'unit':'Unit 1','word':'apple','meaning':'quả táo','example':'I eat an apple.'})
    card=ok('/api/learning/student',opener=c1)['cards'][0]
    assert not ok('/api/learning/student',opener=cother)['cards']
    assert call('/api/learning/student',{'action':'review_vocab','card_id':card['id'],'remembered':True},opener=cother)[0]==404
    for _ in range(2):ok('/api/learning/student',{'action':'review_vocab','card_id':card['id'],'remembered':True},opener=c1)
    progress=ok('/api/learning/student',opener=c1)
    assert progress['cards'][0]['interval_days']==1 and progress['missions'][2]['progress']==1
    feature({'action':'speaking_task','class_id':class_a,'title':'My family','prompt':'Talk about family.','sample':'This is my family.','deadline':str(today)})
    task=ok('/api/learning/student',opener=c1)['speakingTasks'][0]
    def upload_audio():
        buffer=io.BytesIO()
        with wave.open(buffer,'wb') as audio:
            audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(8000);audio.writeframes(b'\0'*1600)
        boundary='GrowthAudioBoundary'
        payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice.wav"\r\nContent-Type: audio/wav\r\n\r\n').encode()+buffer.getvalue()+f'\r\n--{boundary}--\r\n'.encode()
        req=urllib.request.Request(base+'/api/files',data=payload,headers={'Origin':base,'Content-Type':f'multipart/form-data; boundary={boundary}','x-student-session':'1'})
        with c1.open(req) as response:return json.load(response)['id']
    files=[upload_audio(),upload_audio()]
    assert call('/api/learning/student',{'action':'speaking_submit','task_id':task['id'],'file_id':files[0]},opener=c2)[0]==400
    ok('/api/learning/student',{'action':'speaking_submit','task_id':task['id'],'file_id':files[0]},opener=c1)
    first=ok('/api/learning/student',opener=c1)['speakingAttempts'][0]
    feature({'action':'speaking_feedback','id':first['id'],'feedback':'Clearer sounds next time','pronunciation':3,'fluency':4,'content':5})
    ok('/api/learning/student',{'action':'speaking_submit','task_id':task['id'],'file_id':files[1]},opener=c1)
    recordings=ok('/api/learning/student',opener=c1)['speakingAttempts']
    assert len(recordings)==2 and recordings[0]['feedback']=='Clearer sounds next time' and recordings[0]['file_id']==files[0]
    assert call('/api/download/'+files[0]+'?inline=1',opener=c2)[0]==403
    assert call('/api/download/'+files[0]+'?inline=1',opener=c1)[0]==200
    feature({'action':'parent_save','name':'Growth parent','username':'growth_parent','password':'parentpass123','student_ids':[s1['id'],s2['id']]})
    parent=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    assert call('/api/parent/login',{'username':'growth_parent','password':'wrong'},opener=parent)[0]==401
    ok('/api/parent/login',{'username':'growth_parent','password':'parentpass123'},opener=parent)
    digest=ok('/api/parent',opener=parent)
    assert len(digest['children'])==2 and all('token' not in c for c in digest['children'])
    feature({'action':'weekly_note','student_id':s1['id'],'week':digest['week'],'note':'Great effort this week!'})
    assert ok('/api/parent',opener=parent)['children'][0]['note']=='Great effort this week!'
    future=str(today+datetime.timedelta(days=800))
    for cid,time in [(class_a,'08:00'),(class_b,'10:00')]:
        manage({'action':'session','class_id':cid,'date':future,'time':time,'duration':60,'topic':'Growth makeup test'})
    sessions=ok('/api/manage')['sessions']
    original=next(s['id'] for s in sessions if s['class_id']==class_a)
    makeup=next(s['id'] for s in sessions if s['class_id']==class_b)
    assert call('/api/parent',{'action':'request_leave','student_id':other['id'],'session_id':original,'reason':'Sick'},opener=parent)[0]==403
    for s in [s1,s2]:ok('/api/parent',{'action':'request_leave','student_id':s['id'],'session_id':original,'reason':'Family trip'},opener=parent)
    leaves=ok('/api/learning/admin')['leaves']
    assert len(leaves)==2
    feature({'action':'makeup_slot','session_id':makeup,'capacity':1})
    assert call('/api/parent',{'action':'book_makeup','student_id':leaves[0]['student_id'],'leave_id':leaves[0]['id'],'session_id':makeup},opener=parent)[0]==400
    for l in leaves:feature({'action':'leave_decide','id':l['id'],'status':'approved','response':'Please choose a makeup slot.'})
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        results=list(executor.map(lambda l:call('/api/parent',{'action':'book_makeup','student_id':l['student_id'],'leave_id':l['id'],'session_id':makeup},opener=parent)[0],leaves))
    assert sorted(results)==[200,409],results
    assert call('/api/learning/admin',{'action':'makeup_slot','session_id':makeup,'capacity':0})[0]==400
    assert call('/api/manage',{'action':'cancel_session','id':makeup,'reason':'cancel','scope':'single'})[0]==400
    booked=next(l for l in ok('/api/learning/admin')['leaves'] if l['makeup_session_id'])
    assert call('/api/learning/admin',{'action':'makeup_attendance','id':booked['id'],'status':'present'})[0]==400
    account=ok('/api/learning/admin')['parents'][0]
    feature({'action':'parent_save','id':account['id'],'name':'Growth parent','username':'growth_parent','password':'newparentpass','student_ids':[s1['id']]})
    assert call('/api/parent',opener=parent)[0]==401
    ok('/api/parent/login',{'username':'growth_parent','password':'newparentpass'},opener=parent)
    assert len(ok('/api/parent',opener=parent)['children'])==1
    assert call('/api/parent',{'action':'request_leave','student_id':s2['id'],'session_id':original,'reason':'No access'},opener=parent)[0]==403
    ok('/api/parent',{'action':'logout'},opener=parent)
    assert call('/api/parent',opener=parent)[0]==401
    print('PASS: eight learning/family features, permissions, reward idempotency, recordings, and last-seat concurrency')
