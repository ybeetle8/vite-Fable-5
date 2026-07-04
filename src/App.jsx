// 应用入口: 登录 -> 创建角色 -> 游戏
import { useState } from 'react'
import AuthScreen from './ui/AuthScreen.jsx'
import CharacterCreate from './ui/CharacterCreate.jsx'
import GameScreen from './ui/GameScreen.jsx'
import './App.css'

function App() {
  // session: { token, character, classes }
  const [session, setSession] = useState(null)

  function handleLogout() {
    setSession(null)
  }

  if (!session) {
    return <AuthScreen onLoggedIn={setSession} />
  }

  if (!session.character) {
    return (
      <CharacterCreate
        token={session.token}
        classes={session.classes}
        onCreated={(character) => setSession({ ...session, character })}
      />
    )
  }

  return (
    <GameScreen
      token={session.token}
      character={session.character}
      onLogout={handleLogout}
    />
  )
}

export default App
