const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5001/api';

async function request(path, { method = 'GET', body, signal } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error(data?.error ?? `Request failed (${res.status})`);
    err.status = res.status;
    err.detail = data?.detail;
    throw err;
  }
  return data;
}

export const api = {
  health: {
    db: (signal) => request('/health/db', { signal }),
  },
  stats: {
    get: () => request('/stats'),
  },
  barangays: {
    list: () => request('/barangays'),
    create: (b) => request('/barangays', { method: 'POST', body: b }),
  },
  vets: {
    list: () => request('/vets'),
    create: (v) => request('/vets', { method: 'POST', body: v }),
  },
  approvals: {
    list: ({ vet_id, q, limit } = {}) => {
      const qs = new URLSearchParams()
      if (vet_id != null) qs.set('vet_id', String(vet_id))
      if (q)             qs.set('q', q)
      if (limit)         qs.set('limit', String(limit))
      const search = qs.toString()
      return request(`/approvals${search ? `?${search}` : ''}`)
    },
    create: (a) => request('/approvals', { method: 'POST', body: a }),
  },
  driveSessions: {
    list: (q) => {
      const qs = new URLSearchParams()
      if (q) qs.set('q', q)
      const search = qs.toString()
      return request(`/drive-sessions${search ? `?${search}` : ''}`)
    },
    create: (s) => request('/drive-sessions', { method: 'POST', body: s }),
  },
  owners: {
    search: (q = '', limit = 20, signal) => {
      const qs = new URLSearchParams()
      if (q) qs.set('q', q)
      qs.set('limit', String(limit))
      return request(`/owners?${qs}`, { signal })
    },
    get: (id) => request(`/owners/${id}`),
    create: (o) => request('/owners', { method: 'POST', body: o }),
  },
  pets: {
    list: ({ owner_id, barangay_id } = {}) => {
      const qs = new URLSearchParams()
      if (owner_id != null)   qs.set('owner_id', String(owner_id))
      if (barangay_id != null) qs.set('barangay_id', String(barangay_id))
      const search = qs.toString()
      return request(`/pets${search ? `?${search}` : ''}`)
    },
    get: (id) => request(`/pets/${id}`),
    create: (p) => request('/pets', { method: 'POST', body: p }),
  },
  vaccinations: {
    list: (pet_id) => request(`/vaccinations${pet_id ? `?pet_id=${pet_id}` : ''}`),
    listAll: ({ session_id, is_office_visit } = {}) => {
      const qs = new URLSearchParams()
      if (session_id != null) qs.set('session_id', String(session_id))
      if (is_office_visit)    qs.set('is_office_visit', 'true')
      const search = qs.toString()
      return request(`/vaccinations${search ? `?${search}` : ''}`)
    },
    create: (v) => request('/vaccinations', { method: 'POST', body: v }),
    update: (id, body) => request(`/vaccinations/${id}`, { method: 'PUT', body }),
    remove: (id) => request(`/vaccinations/${id}`, { method: 'DELETE' }),
  },
};
