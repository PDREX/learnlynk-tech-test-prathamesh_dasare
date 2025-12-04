// frontend/pages/dashboard/today.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';// adjust path if your client file is in a different location

type Task = {
  id: string;
  application_id: string;
  title?: string | null;
  type: 'call' | 'email' | 'review' | string;
  status: string;
  due_at: string;
  tenant_id?: string;
  created_at?: string;
};

export default function TodayTasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);

  // compute start/end of local "today" in ISO so we query tasks where due_at is between these
  function getTodayRangeISO() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }

  async function fetchTasksDueToday() {
    setLoading(true);
    setError(null);
    try {
      const { startISO, endISO } = getTodayRangeISO();

      // fetch tasks where due_at between start and end, and status != 'completed'
      const { data, error: fetchError } = await supabase
        .from<Task>('tasks')
        .select('id, application_id, title, type, status, due_at, tenant_id, created_at')
        .gte('due_at', startISO)
        .lte('due_at', endISO)
        .neq('status', 'completed')
        .order('due_at', { ascending: true });

      if (fetchError) throw fetchError;
      setTasks(data ?? []);
    } catch (err: any) {
      console.error('Fetch tasks error', err);
      setError(err?.message || String(err));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTasksDueToday();
    // optional: poll every 30 seconds
    const timer = setInterval(() => fetchTasksDueToday(), 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markComplete(taskId: string) {
    setUpdatingTaskId(taskId);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', taskId);

      if (updateError) throw updateError;
      // refresh list
      await fetchTasksDueToday();
    } catch (err: any) {
      console.error('Update task error', err);
      setError(err?.message || String(err));
    } finally {
      setUpdatingTaskId(null);
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 1000 }}>
      <h1>Tasks due today</h1>

      {loading && <div>Loading tasks…</div>}
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}

      {!loading && tasks && tasks.length === 0 && <div>No tasks due today 🎉</div>}

      {!loading && tasks && tasks.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
          <thead>
            <tr>
              <th style={th}>Type</th>
              <th style={th}>Application ID</th>
              <th style={th}>Due At</th>
              <th style={th}>Status</th>
              <th style={th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={{ borderTop: '1px solid #eee' }}>
                <td style={td}>{t.type}</td>
                <td style={td}><code>{t.application_id}</code></td>
                <td style={td}>{new Date(t.due_at).toLocaleString()}</td>
                <td style={td}>{t.status}</td>
                <td style={td}>
                  <button
                    onClick={() => markComplete(t.id)}
                    disabled={updatingTaskId === t.id}
                    style={{
                      padding: '6px 10px',
                      cursor: updatingTaskId === t.id ? 'not-allowed' : 'pointer',
                      backgroundColor: '#1976d2',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                    }}
                  >
                    {updatingTaskId === t.id ? 'Updating…' : 'Mark Complete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = { textAlign: 'left', padding: '8px', borderBottom: '1px solid #ddd' };
const td: React.CSSProperties = { padding: '8px', verticalAlign: 'top' };
