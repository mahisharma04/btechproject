const TOKEN_KEY = 'syncora_token';
const USER_KEY = 'syncora_user';

const BASE_URL = import.meta.env.VITE_API_URL || '';

export const getErrorMessage = (err, fallback = 'Something went wrong') => {
  if (!err) return fallback;
  if (Array.isArray(err) && err.length) {
    return getErrorMessage(err[0], fallback);
  }
  if (typeof err === 'string') return err || fallback;
  if (err instanceof Error) {
    const msg = err.message;
    if (msg && !msg.startsWith('[object Object]')) return msg;
  }
  const detail = err.detail || err.data?.detail || err.error?.message || err.message;
  if (typeof detail === 'string' && detail) return detail;
  try {
    const s = JSON.stringify(err);
    if (s && s !== '{}' && s.length < 200) return s;
  } catch {}
  return fallback;
};

const getToken = () => localStorage.getItem(TOKEN_KEY);

export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const setStoredUser = (user) => {
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
};

const buildHeaders = (headers = {}) => {
  const token = getToken();
  const out = { ...headers };
  if (token && !out.Authorization) {
    out.Authorization = `Bearer ${token}`;
  }
  return out;
};

const handleResponse = async (res) => {
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/';
    }
    const text = await res.text().catch(() => 'Unauthorized');
    throw new Error(text || 'Unauthorized');
  }

  let data = null;
  // 204 No Content (e.g. DELETE) has no body, so skip parsing entirely.
  if (res.status !== 204) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const text = await res.text();
      data = text ? JSON.parse(text) : null;
    } else {
      data = await res.text().catch(() => null);
    }
  }

  if (!res.ok) {
    let msg;
    if (data && (typeof data.detail === 'string' ? data.detail : null)) {
      msg = data.detail;
    } else if (typeof data === 'string' && data) {
      msg = data;
    } else {
      const fallback = `Request failed (${res.status})`;
      try {
        msg = getErrorMessage(data && data.detail ? data.detail : data, fallback);
      } catch {
        msg = fallback;
      }
    }
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

class HttpClient {
  constructor() {
    this.controller = new AbortController();
  }

  abort() {
    this.controller.abort();
    this.controller = new AbortController();
  }

  async _request(method, url, { params, body, headers, isForm } = {}) {
    let fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    if (params) {
      const usp = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) usp.append(k, String(v));
      });
      const qs = usp.toString();
      if (qs) fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
    }

    const opts = {
      method,
      headers: buildHeaders(headers),
      signal: this.controller.signal,
    };

    if (body !== undefined) {
      if (isForm) {
        opts.body = body;
      } else if (typeof body === 'string') {
        opts.body = body;
      } else {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
    }

    const res = await fetch(fullUrl, opts);
    return handleResponse(res);
  }

  get(url, params) {
    return this._request('GET', url, { params });
  }
  post(url, body, opts) {
    return this._request('POST', url, { body, ...opts });
  }
  patch(url, body) {
    return this._request('PATCH', url, { body });
  }
  delete(url) {
    return this._request('DELETE', url);
  }
}

const http = new HttpClient();

export const api = {
  client: http,

  getAuthHeader() {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  },

  isLoggedIn() {
    return !!getToken();
  },

  async register({ name, email, password }) {
    const data = await http.post('/api/v1/auth/register', { name, email, password });
    if (data?.access_token) {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      if (data?.user) setStoredUser(data.user);
    }
    return data;
  },

  async login({ email, password }) {
    const form = new URLSearchParams();
    form.append('username', email);
    form.append('password', password);
    const data = await http.post(
      '/api/v1/auth/login',
      form.toString(),
      { isForm: true, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    if (data?.access_token) {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      if (data?.user) setStoredUser(data.user);
    }
    return data;
  },

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  async getMe() {
    return http.get('/api/v1/auth/me');
  },

  async getStats() {
    const s = await http.get('/api/v1/auth/me/stats');
    return {
      totalMeetings: s.total_meetings ?? 0,
      readyMeetings: s.ready_meetings ?? 0,
      failedMeetings: s.failed_meetings ?? 0,
      processingMeetings: s.processing_meetings ?? 0,
      pendingActionItems: s.pending_action_items ?? 0,
      completedActionItems: s.completed_action_items ?? 0,
      totalActionItems: s.total_action_items ?? 0,
      totalKeyDecisions: s.total_key_decisions ?? 0,
      totalDurationMinutes: s.total_duration_minutes ?? 0,
      hoursSaved: Math.round((s.total_duration_minutes ?? 0) * 0.6),
    };
  },

  async getMeetings({ page = 1, perPage = 50 } = {}) {
    const res = await http.get('/api/v1/meetings', { page, per_page: perPage });
    return (res?.items || []).map(mapMeetingListItem);
  },

  async getMeeting(id) {
    const m = await http.get(`/api/v1/meetings/${id}`);
    return mapMeetingDetail(m);
  },

  async getMeetingStatus(id) {
    return http.get(`/api/v1/meetings/${id}/status`);
  },

  getMediaUrl(id) {
    const url = `/api/v1/meetings/${id}/media`;
    const token = getToken();
    const sep = url.includes('?') ? '&' : '?';
    const qs = token ? `${sep}access_token=${encodeURIComponent(token)}` : '';
    return BASE_URL ? `${BASE_URL}${url}${qs}` : `${url}${qs}`;
  },

  async uploadMeeting({ file, title, date, onProgress }) {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    if (date) {
      form.append('date', (typeof date === 'string' ? date : date.toISOString()));
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = BASE_URL ? `${BASE_URL}/api/v1/meetings/upload` : '/api/v1/meetings/upload';
      xhr.open('POST', url);
      const token = getToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
      }

      xhr.onload = () => {
        try {
          const ct = xhr.getResponseHeader('content-type') || '';
          const body = ct.includes('application/json')
            ? JSON.parse(xhr.responseText)
            : xhr.responseText;
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(body);
          } else {
            const msg = (body && body.detail) ? body.detail : `Upload failed (${xhr.status})`;
            reject(new Error(msg));
          }
        } catch (err) {
          reject(err);
        }
      };
      xhr.onerror = () => reject(new Error('Upload failed (network error)'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));
      xhr.send(form);
    });
  },

  async retryMeeting(id) {
    return http.post(`/api/v1/meetings/${id}/retry`);
  },

  async toggleActionItem(meetingId, itemId, completed) {
    return http.patch(
      `/api/v1/meetings/${meetingId}/action-items/${itemId}`,
      { completed }
    );
  },

  async deleteMeeting(id) {
    return http.delete(`/api/v1/meetings/${id}`);
  },

  async sendChatMessage(meetingId, message) {
    const body = { question: message };
    const url = meetingId
      ? `/api/v1/chat/meeting/${meetingId}`
      : '/api/v1/chat/global';
    const res = await http.post(url, body);
    return {
      text: res?.answer || '',
      sources: (res?.sources || []).map(s => ({
        meetingId: s.meeting_id,
        meetingTitle: s.meeting_title,
      })),
    };
  },
};

function mapOwner(ownerName, ownerInitials) {
  if (!ownerName) return null;
  return {
    name: ownerName,
    initials: ownerInitials || (ownerName
      .split(' ')
      .map(p => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()),
  };
}

function formatDateValue(v) {
  if (v && typeof v === 'string') {
    // Ensure dates are parseable and in a standard form
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return v;
}

function mapMeetingListItem(m) {
  return {
    id: String(m.id),
    title: m.title,
    date: formatDateValue(m.date),
    duration: Number(m.duration) || 0,
    status: m.status || 'processing',
    failureReason: m.failure_reason || null,
    mediaFilename: m.media_filename || null,
    createdBy: m.created_by,
  };
}

function mapMeetingDetail(m) {
  return {
    ...mapMeetingListItem(m),
    summary: m.summary || '',
    transcript: m.transcript || '',
    actionItems: (m.action_items || []).map(ai => ({
      id: String(ai.id),
      text: ai.text,
      owner: mapOwner(ai.owner_name, ai.owner_initials),
      ownerName: ai.owner_name || null,
      ownerInitials: ai.owner_initials || null,
      dueDate: ai.due_date ? String(ai.due_date) : null,
      completed: !!ai.completed,
    })),
    keyDecisions: (m.key_decisions || []).map(kd => ({
      id: String(kd.id),
      text: kd.text,
    })),
  };
}

export default api;
