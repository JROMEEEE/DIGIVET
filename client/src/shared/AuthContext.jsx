import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

function loadStored() {
  try {
    const raw = localStorage.getItem('digivet_user')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadStored)

  function login(userData, token) {
    localStorage.setItem('digivet_token', token)
    localStorage.setItem('digivet_user', JSON.stringify(userData))
    setUser(userData)
  }

  function logout() {
    localStorage.removeItem('digivet_token')
    localStorage.removeItem('digivet_user')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
