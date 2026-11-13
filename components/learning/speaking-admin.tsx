'use client';
import type { Data } from '@/lib/types';
import type { GrowthAdminData, SaveFeature } from '@/lib/growth-types';
import { localDay } from '@/lib/growth';
export default function SpeakingAdmin({
  data,
  feature,
  classId,
  save,
}: {
  data: Data;
  feature: GrowthAdminData;
  classId: number;
  save: SaveFeature;
}) {
  return (
    <div className="growth-stack">
      <section className="growth-card">
        <h3>Giao bài luyện nói</h3>
        <form
          className="growth-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            if (
              await save({
                action: 'speaking_task',
                class_id: classId,
                title: fd.get('title'),
                prompt: fd.get('prompt'),
                sample: fd.get('sample'),
                deadline: fd.get('deadline'),
              })
            )
              form.reset();
          }}
        >
          <div className="growth-fields">
            <label>
              Tên bài
              <input name="title" required maxLength={200} />
            </label>
            <label>
              Hạn nộp
              <input
                type="date"
                name="deadline"
                required
                defaultValue={localDay()}
              />
            </label>
          </div>
          <label>
            Chủ đề / hướng dẫn
            <textarea name="prompt" required maxLength={3000} />
          </label>
          <label>
            Câu mẫu tiếng Anh (có nút nghe)
            <textarea name="sample" maxLength={3000} />
          </label>
          <button className="primary" disabled={!classId}>
            Giao bài cho lớp
          </button>
        </form>
      </section>
      {feature.speakingTasks
        .filter((t) => t.class_id === classId)
        .map((task) => (
          <section className="growth-card" key={task.id}>
            <div className="growth-toolbar">
              <h3>{task.title}</h3>
              <span>Hạn {task.deadline}</span>
              <button
                className="text-button"
                onClick={() => {
                  if (confirm('Xóa bài luyện nói cùng các lần nộp?'))
                    void save({ action: 'speaking_delete', id: task.id });
                }}
              >
                Xóa bài
              </button>
            </div>
            <p>{task.prompt}</p>
            <blockquote>{task.sample}</blockquote>
            {!feature.speakingAttempts.some((a) => a.task_id === task.id) && (
              <p className="growth-empty">Chưa có bản ghi âm nộp.</p>
            )}
            {data.students
              .filter((s) =>
                feature.speakingAttempts.some(
                  (a) => a.task_id === task.id && a.student_id === s.id,
                ),
              )
              .map((student) => (
                <details className="growth-item" key={student.id}>
                  <summary>
                    {student.name} ·{' '}
                    {
                      feature.speakingAttempts.filter(
                        (a) =>
                          a.task_id === task.id && a.student_id === student.id,
                      ).length
                    }{' '}
                    lần nộp
                  </summary>
                  <div className="growth-grid">
                    {feature.speakingAttempts
                      .filter(
                        (a) =>
                          a.task_id === task.id && a.student_id === student.id,
                      )
                      .map((a, i) => (
                        <article className="growth-card" key={a.id}>
                          <strong>
                            {i === 0 ? 'Bản đầu' : `Bản sửa ${i}`} ·{' '}
                            {new Date(a.created_at).toLocaleDateString('vi-VN')}
                          </strong>
                          <audio
                            controls
                            preload="none"
                            src={`/api/download/${a.file_id}?inline=1`}
                          />
                          <form
                            className="growth-stack"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const fd = new FormData(e.currentTarget);
                              void save({
                                action: 'speaking_feedback',
                                id: a.id,
                                feedback: fd.get('feedback'),
                                pronunciation: Number(fd.get('pronunciation')),
                                fluency: Number(fd.get('fluency')),
                                content: Number(fd.get('content')),
                              });
                            }}
                          >
                            <div className="growth-fields">
                              {[
                                ['pronunciation', 'Phát âm'],
                                ['fluency', 'Trôi chảy'],
                                ['content', 'Nội dung'],
                              ].map(([key, label]) => (
                                <label key={key}>
                                  {label}
                                  <select
                                    name={key}
                                    defaultValue={
                                      a[key as 'pronunciation'] ?? ''
                                    }
                                    required
                                  >
                                    <option value="" disabled>
                                      Chọn điểm
                                    </option>
                                    {[1, 2, 3, 4, 5].map((n) => (
                                      <option key={n} value={n}>
                                        {n}/5
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ))}
                            </div>
                            <label>
                              Góp ý
                              <textarea
                                name="feedback"
                                maxLength={3000}
                                defaultValue={a.feedback}
                              />
                            </label>
                            <button className="primary">
                              Lưu nhận xét bản này
                            </button>
                          </form>
                        </article>
                      ))}
                  </div>
                </details>
              ))}
          </section>
        ))}
    </div>
  );
}
