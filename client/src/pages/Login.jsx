import { useState } from 'react'
import { useNavigate } from 'react-router'
import { clearSession, login, register, saveSession } from '../services/api.js'

function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', password: '' })
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')

    try {
      const action = mode === 'register' ? register : login
      const session = await action(form)
      saveSession(session)
      setMessage(`${mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'} thành công.`)
      navigate('/')
    } catch (error) {
      clearSession()
      setMessage(error.message || 'Không thể xử lý yêu cầu.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-shell">
      <div className="auth-copy">
        <p className="eyebrow">Authentication</p>
        <h1>Đăng nhập để mở nhạc và lưu lịch sử nghe</h1>
        <p>
          MELODYNET dùng JWT để giữ phiên đăng nhập, còn phần stream sẽ đi qua WebSocket bridge để
          browser nhận chunk audio theo thứ tự.
        </p>
      </div>

      <form className="panel auth-form" onSubmit={handleSubmit}>
        <div className="mode-switch">
          <button
            type="button"
            className={mode === 'login' ? 'chip chip-active' : 'chip'}
            onClick={() => setMode('login')}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'chip chip-active' : 'chip'}
            onClick={() => setMode('register')}
          >
            Đăng ký
          </button>
        </div>

        <label className="field">
          <span>Username</span>
          <input name="username" value={form.username} onChange={updateField} autoComplete="username" placeholder="your-name" />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={updateField}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            placeholder="••••••••"
          />
        </label>

        {message ? <p className="status-line">{message}</p> : null}

        <button className="button button-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Đang xử lý...' : mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'}
        </button>
      </form>
    </section>
  )
}

export default Login

