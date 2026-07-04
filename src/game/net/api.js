// HTTP 接口封装(注册/登录/角色创建)
async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export const api = {
  register: (username, password) => post('/api/register', { username, password }),
  login: (username, password) => post('/api/login', { username, password }),
  createCharacter: (token, nickname, classId) =>
    post('/api/character', { token, nickname, classId }),
}
