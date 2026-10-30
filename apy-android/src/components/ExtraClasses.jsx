import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api';
import { notifyExtraClassesChanged, subscribeExtraClasses } from '../utils/extraClassSync';
import './ExtraClasses.css';

const emptyDraft = () => ({ subject: '', periods: 1, session: 'unspecified', status: 'unmarked' });
const fields = record => ({ subject: record.subject, periods: record.periods, session: record.session || 'unspecified', status: record.status || 'unmarked' });

export default function ExtraClasses({ date, locked, subjects, onAttendanceUpdated }) {
  const id = useId();
  const alive = useRef(true);
  const busy = useRef(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [removing, setRemoving] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    alive.current = true;
    const unsubscribe = subscribeExtraClasses({
      date,
      load: api.getExtraClasses,
      onRecords: records => { setRecords(records); setLoaded(true); },
      onLoading: loading => {
        setLoading(loading);
        if (loading) { setLoaded(false); setError(''); }
      },
      onError: err => setError(err.message || 'Could not load extra classes.')
    });
    return () => { alive.current = false; unsubscribe(); };
  }, [date, reload]);

  async function mutate(operation, message) {
    if (busy.current || locked || !loaded) return;
    busy.current = true;
    setPending(true);
    setError('');
    setNotice('');
    try {
      const result = await operation();
      if (alive.current) {
        setEditor(null);
        setRemoving(null);
        setNotice(message);
      }
      // Every mounted copy, including the writer, reconciles from the server.
      // This also notifies a new copy mounted while this write was pending.
      notifyExtraClassesChanged(date);
      if (result.summary) onAttendanceUpdated?.(result.summary);
    } catch (err) {
      if (alive.current) setError(err.message || 'Could not save. Please try again.');
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  }

  function save(event) {
    event.preventDefault();
    const subject = draft.subject.trim();
    const periods = Number(draft.periods);
    if (!subject || !Number.isInteger(periods) || periods < 1 || periods > 10) {
      setError('Enter a subject and a whole number of periods from 1 to 10.');
      return;
    }
    const payload = { ...draft, subject: subjects.find(s => s.toLowerCase() === subject.toLowerCase()) || subject, periods };
    if (editor === 'new') {
      mutate(() => api.addExtraClass({ ...payload, log_date: date }), 'Extra class added.');
    } else {
      mutate(() => api.updateExtraClass(editor.id, payload), 'Extra class updated.');
    }
  }

  const disabled = pending || loading || !loaded || locked;
  return (
    <section className="ledger-card extra-classes" aria-labelledby={`${id}-heading`} aria-busy={pending || loading}>
      <div className="card-header-ruled extra-header">
        <div>
          <h3 id={`${id}-heading`} className="card-header-title">Extra classes</h3>
          <p className="extra-detail">{date} · Date-specific periods</p>
        </div>
        <button type="button" className="btn btn-secondary" disabled={disabled || editor !== null} onClick={() => {
          setDraft(emptyDraft()); setEditor('new'); setRemoving(null); setError(''); setNotice('');
        }}>+ Add extra class</button>
      </div>
      {locked && <p className="extra-detail" role="note">🔒 This date is included in your historical baseline. Extra classes are locked.</p>}
      {loading && <p role="status">Loading extra classes…</p>}
      {error && <div className="alert-callout error" role="alert"><span>{error}</span>{!pending && editor === null && <button type="button" className="btn btn-secondary" onClick={() => { setLoading(true); setLoaded(false); setError(''); setReload(value => value + 1); }}>Retry loading</button>}</div>}
      <p className="extra-detail" role="status">{pending ? 'Saving changes…' : notice}</p>
      {!loading && !error && records.length === 0 && <p className="extra-detail">No extra classes for this date. Add one to plan or record attendance.</p>}
      <div className="extra-list">
        {records.map(record => (
          <article key={record.id} className="extra-record" aria-label={`${record.subject}, ${record.periods} periods`}>
            <div className="extra-record-heading">
              <strong>{record.subject}</strong>
              <span className="extra-detail">{record.periods} {record.periods === 1 ? 'period' : 'periods'} · {record.session === 'unspecified' ? 'Any session' : record.session} · {record.status}</span>
            </div>
            <div className="extra-actions">
              {['present', 'absent'].map(status => <button key={status} type="button"
                className={`btn-status-action ${record.status === status ? `is-${status}` : ''}`}
                aria-pressed={record.status === status}
                aria-label={`${status === 'present' ? 'Present' : 'Absent'}: ${record.subject}; select again to unmark`}
                disabled={disabled || editor !== null || removing !== null}
                onClick={() => mutate(() => api.updateExtraClass(record.id, { ...fields(record), status: record.status === status ? 'unmarked' : status }), 'Attendance saved.')}>{status === 'present' ? 'Present' : 'Absent'}</button>)}
              <button type="button" className="btn btn-secondary" disabled={disabled || editor !== null || removing !== null} onClick={() => { setEditor(record); setDraft(fields(record)); setRemoving(null); setError(''); }}>Edit<span className="sr-only"> {record.subject}</span></button>
              <button type="button" className="btn btn-secondary" disabled={disabled || editor !== null || removing !== null} onClick={() => setRemoving(record.id)}>Remove<span className="sr-only"> {record.subject}</span></button>
            </div>
            {removing === record.id && <div className="extra-confirm" role="group" aria-label={`Confirm removal of ${record.subject}`}>
              <p>Remove {record.subject} and its attendance?</p>
              <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => mutate(() => api.deleteExtraClass(record.id), 'Extra class removed.')}>Confirm removal</button>
              <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => setRemoving(null)}>Cancel</button>
            </div>}
          </article>
        ))}
      </div>
      {editor !== null && <form onSubmit={save} className="extra-form">
        <h4>{editor === 'new' ? 'Add extra class' : `Edit ${editor.subject}`}</h4>
        <fieldset disabled={disabled}>
          <label htmlFor={`${id}-subject`}>Subject</label>
          <input id={`${id}-subject`} list={`${id}-subjects`} value={draft.subject} required autoFocus onChange={event => setDraft(prev => ({ ...prev, subject: event.target.value }))} placeholder="Choose a subject or type your own" />
          <datalist id={`${id}-subjects`}>{subjects.map(subject => <option key={subject} value={subject} />)}</datalist>
          <div className="extra-fields">
            <label>Periods (1–10)<input type="number" min="1" max="10" step="1" required value={draft.periods} onChange={event => setDraft(prev => ({ ...prev, periods: event.target.value }))} /></label>
            <label>Session<select value={draft.session} onChange={event => setDraft(prev => ({ ...prev, session: event.target.value }))}>
              <option value="unspecified">Unspecified</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option>
            </select></label>
            {editor !== 'new' && <label>Status<select value={draft.status} onChange={event => setDraft(prev => ({ ...prev, status: event.target.value }))}>
              {['unmarked', 'present', 'absent', 'holiday'].map(status => <option key={status} value={status}>{status}</option>)}
            </select></label>}
          </div>
          {editor === 'new' && <p className="extra-detail">Starts unmarked. Planned periods do not enter attendance totals until marked.</p>}
          <div className="extra-actions"><button type="submit" className="btn btn-primary">{pending ? 'Saving…' : 'Save class'}</button><button type="button" className="btn btn-secondary" onClick={() => { setEditor(null); setError(''); }}>Cancel</button></div>
        </fieldset>
      </form>}
    </section>
  );
}
