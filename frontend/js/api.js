export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }

  if (!res.ok) {
    const onLogin = location.pathname.endsWith('/login.html');
    if (res.status === 401 && !onLogin && !url.endsWith('/auth/login')) {
      location.href = '/pages/login.html';
    }
    throw new ApiError((data && data.error) || 'Request failed.', res.status);
  }
  return data;
}

// Multipart upload (FormData). The browser sets the multipart boundary, so no Content-Type header here.
async function upload(method, url, formData) {
  let res;
  try {
    res = await fetch(url, { method, credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' }, body: formData });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError((data && data.error) || 'Upload failed.', res.status);
  return data;
}

export const api = {
  upload: (method, url, formData) => upload(method, url, formData),
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body = {}) => request('PUT', url, body),
  patch: (url, body = {}) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
};
